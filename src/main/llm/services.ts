/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
import { Ollama } from 'ollama';
import { MODELS, CONFIG_MODELS } from '../../constants/misc';

export interface LLMInitialisationProgress {
  error?: Error;
  filename?: string;
  downloaded?: number;
  total?: number;
  percentage?: number;
  status?: string;
  completed?: boolean;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  format?: any;
}

export default class LLMServices {
  private static host: string = 'http://127.0.0.1:11434';

  private static ollamaClient: Ollama = new Ollama({ host: LLMServices.host });

  private static state: 'idle' | 'initialising' | 'running' = 'idle';

  static async init(
    onProgress?: (progress: LLMInitialisationProgress) => void,
    host?: string,
  ): Promise<void> {
    if (this.state === 'initialising') {
      console.info('LLM Service is already initialising');
      return;
    }

    if (host) {
      this.setHost(host);
    } else {
      this.setHost(this.host);
    }

    this.state = 'initialising';
    onProgress?.({ status: `Connecting to Ollama at ${this.host}` });

    try {
      const isRunning = await this.isOllamaRunning();
      if (!isRunning) {
        throw new Error(`Cannot reach Ollama at ${this.host}`);
      }

      onProgress?.({ status: 'Connected to Ollama' });
      onProgress?.({ status: 'Checking required models' });

      await this.downloadModels(
        Array.from(new Set(Object.values(CONFIG_MODELS))),
        onProgress,
      );

      onProgress?.({
        status: 'LLM Service Initialization Complete',
        completed: true,
      });

      console.log('=== LLM Service Initialization Complete ===');
      this.state = 'running';
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onProgress?.({
        status: `initialization failed due to ${err.message}`,
        error: err,
        completed: true,
      });
      console.error('=== LLM Service Initialization Failed ===', err);
      this.state = 'idle';
      throw err;
    }
  }

  static async recommendModelForQuestionGeneration(): Promise<string> {
    if (!(await this.isOllamaRunning())) {
      throw new Error('Ollama is not running');
    }

    const list = await this.ollamaClient.list();
    const hasGemma3n = list.models?.some((model: any) =>
      model.name.includes(MODELS.GEMMA_3N_E4B_IT_FP16),
    );

    if (!hasGemma3n) {
      return MODELS.GEMMA3N_E2B_IT_Q4_K_M;
    }

    return MODELS.GEMMA_3N_E4B_IT_FP16;
  }

  static async downloadModels(
    modelNames: (typeof MODELS)[keyof typeof MODELS][],
    onProgress?: (progress: LLMInitialisationProgress) => void,
  ): Promise<void> {
    if (!(await this.isOllamaRunning())) {
      onProgress?.({
        status: `Ollama is not reachable at ${this.host}. Skipping model download.`,
      });
      return;
    }

    const response = await this.ollamaClient.list();
    for (const modelName of modelNames) {
      if (response.models?.some((model) => model.name.includes(modelName))) {
        onProgress?.({
          status: `model ${modelName} is already installed`,
        });
      } else {
        await this.downloadModel(modelName, onProgress);
      }
    }
  }

  static async downloadModel(
    modelName: string,
    onProgress?: (progress: LLMInitialisationProgress) => void,
  ): Promise<void> {
    onProgress?.({
      filename: modelName,
      downloaded: 0,
      total: 0,
      percentage: 0,
      status: `starting model download ${modelName}`,
    });

    console.info(`downloading model ${modelName}...`);

    let stream = null;

    try {
      stream = await this.ollamaClient.pull({
        model: modelName,
        stream: true,
      });
    } catch (error) {
      console.warn(`failed to download model ${modelName}: ${error}`);
      onProgress?.({
        filename: modelName,
        downloaded: 0,
        total: 0,
        percentage: 0,
        status: `model ${modelName} download failed`,
        error: new Error(String(error)),
      });
    }

    if (stream == null) {
      onProgress?.({
        filename: modelName,
        downloaded: 0,
        total: 0,
        percentage: 0,
        status: `model ${modelName} download failed`,
        error: new Error('Failed to download model'),
      });
      return;
    }

    let totalSize = 0;
    let downloadedSize = 0;

    for await (const part of stream) {
      if (part.total && part.completed) {
        totalSize = part.total;
        downloadedSize = part.completed;

        onProgress?.({
          filename: modelName,
          downloaded: downloadedSize,
          total: totalSize,
          percentage: Math.round((downloadedSize / totalSize) * 100),
          status: `downloading model ${modelName}`,
        });
      }

      if (part.status === 'success') {
        onProgress?.({
          filename: modelName,
          downloaded: totalSize || downloadedSize,
          total: totalSize || downloadedSize,
          percentage: 100,
          status: `model ${modelName} downloaded successfully`,
        });
        console.info(`model ${modelName} downloaded successfully`);
        break;
      }
    }
  }

  static async createEmbedding(input: string): Promise<{
    success: boolean;
    embeddings?: number[][];
    error?: string;
  }> {
    try {
      if (!(await this.isOllamaRunning())) {
        return {
          success: false,
          error: `Ollama is not running at ${this.host}. Please ensure it is accessible and try again.`,
        };
      }

      const list = await this.ollamaClient.list();
      if (
        !list.models?.some((model: any) =>
          model.name.includes(CONFIG_MODELS.EMBEDDING_MODEL),
        )
      ) {
        return {
          success: false,
          error: `Embedding model ${CONFIG_MODELS.EMBEDDING_MODEL} is not installed. Please download it first.`,
        };
      }

      const response = await this.ollamaClient.embed({
        model: CONFIG_MODELS.EMBEDDING_MODEL,
        input,
      });

      return { success: true, embeddings: response.embeddings };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  static async generate(
    request: GenerateRequest,
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      if (!(await this.isOllamaRunning())) {
        return {
          success: false,
          error: `Ollama is not running at ${this.host}. Please ensure it is accessible and try again.`,
        };
      }

      const list = await this.ollamaClient.list();
      if (
        !list.models?.some((model: any) => model.name.includes(request.model))
      ) {
        return {
          success: false,
          error: `Model ${request.model} is not installed. Please download it first.`,
        };
      }

      const response = await this.ollamaClient.generate({
        ...request,
        stream: false,
      });

      return {
        success: true,
        response: response.response || 'No response from model',
      };
    } catch (error) {
      console.error(`failed to generate: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  private static setHost(host: string) {
    const normalised = this.normalizeHost(host);
    if (!normalised) {
      return;
    }

    this.host = normalised;
    this.ollamaClient = new Ollama({ host: this.host });
  }

  private static normalizeHost(host?: string): string {
    const fallback = 'http://127.0.0.1:11434';
    if (!host) {
      return fallback;
    }

    let normalised = host.trim();
    if (!normalised) {
      return fallback;
    }

    if (!/^https?:\/\//i.test(normalised)) {
      normalised = `http://${normalised}`;
    }

    return normalised.replace(/\/+$/, '');
  }

  private static async isOllamaRunning(): Promise<boolean> {
    try {
      await this.ollamaClient.list();
      return true;
    } catch (error) {
      console.info('Ollama server is not running', error);
      return false;
    }
  }
}
