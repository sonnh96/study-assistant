/* eslint-disable no-use-before-define */
/* eslint-disable react/jsx-props-no-spreading */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Loader, Text, Progress, TextInput, Button } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { LLMInitialisationProgress } from '../../main/llm/services';

const formatBytesToMB = (bytes: number): string => {
  const mb = Math.round(bytes / (1024 * 1024));
  return `${mb} MB`;
};

export default function SplashScreen() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<LLMInitialisationProgress | null>(
    null,
  );
  const subscription = useRef<() => void>(() => {});
  const storedHostRef = useRef<string | null>(null);

  if (storedHostRef.current === null) {
    try {
      storedHostRef.current = window.localStorage.getItem('ollamaHost');
    } catch {
      storedHostRef.current = null;
    }
  }

  const [ollamaHost, setOllamaHost] = useState<string>(
    storedHostRef.current ?? 'http://127.0.0.1:11434',
  );
  const [isInitialising, setIsInitialising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldAutoConnectRef = useRef<boolean>(Boolean(storedHostRef.current));

  const handleProgress = useCallback(
    (p: LLMInitialisationProgress) => {
      setProgress(p);
    },
    [setProgress],
  );

  const startInitialisation = useCallback(async (hostValue: string) => {
    const trimmedHost = hostValue.trim();
    if (!trimmedHost) {
      setError('Please enter the Ollama API URL.');
      return;
    }

    setError(null);
    setProgress(null);
    setIsInitialising(true);

    try {
      window.localStorage.setItem('ollamaHost', trimmedHost);
    } catch {
      // Ignore storage failures and continue with initialization
    }

    try {
      const response = await window.electron.llm.initialise(trimmedHost);
      if (!response?.success) {
        setIsInitialising(false);
        setError(
          response?.error ||
            'Failed to initialize the LLM service. Please retry.',
        );
      }
    } catch (err) {
      setIsInitialising(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    subscription.current =
      window.electron.llm.onInitialisationProgress(handleProgress);
  }, [handleProgress]);

  useEffect(() => {
    return () => {
      subscription.current?.();
    };
  }, []);

  useEffect(() => {
    if (shouldAutoConnectRef.current && storedHostRef.current) {
      shouldAutoConnectRef.current = false;
      startInitialisation(storedHostRef.current);
    }
  }, [startInitialisation]);

  useEffect(() => {
    if (progress?.error) {
      setError(progress.error.message);
    }
  }, [progress?.error]);

  useEffect(() => {
    if (progress?.completed) {
      setIsInitialising(false);
    }
  }, [progress?.completed]);

  useEffect(() => {
    if (progress?.completed === true && !progress?.error) {
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    }
  }, [progress?.completed, progress?.error, navigate]);

  return (
    <div {...stylex.props(styles.container)}>
      <div {...stylex.props(styles.content)}>
        <div {...stylex.props(styles.title)}>Saidia</div>
        <Text size="lg" fw={500}>
          AI Teacher&apos;s Assistants
        </Text>
        <div {...stylex.props(styles.form)}>
          <TextInput
            label="Ollama API URL"
            placeholder="http://localhost:11434"
            value={ollamaHost}
            onChange={(event) => setOllamaHost(event.currentTarget.value)}
            disabled={isInitialising}
          />
          <Button
            fullWidth
            onClick={() => startInitialisation(ollamaHost)}
            disabled={isInitialising}
          >
            {isInitialising ? 'Connecting...' : 'Connect to Ollama'}
          </Button>
          {error && (
            <Text size="sm" fw={600} c="red">
              {error}
            </Text>
          )}
        </div>
        {isInitialising && (
          <div {...stylex.props(styles.loaderContent)}>
            {progress?.percentage && progress.percentage > 0 ? (
              <div {...stylex.props(styles.progress)}>
                <Progress.Root size={18}>
                  <Progress.Section value={progress.percentage} color="gray">
                    <Progress.Label>{progress.percentage}%</Progress.Label>
                  </Progress.Section>
                </Progress.Root>
              </div>
            ) : (
              <Loader color="gray" size={18} />
            )}

            <Text size="xs">
              {progress?.downloaded && progress?.total
                ? `${progress?.status || 'Downloading'} - ${formatBytesToMB(progress.downloaded)} / ${formatBytesToMB(progress.total)}`
                : progress?.status || 'Setting up, please wait...'}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = stylex.create({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    textAlign: 'center',
  },
  progress: {
    width: '100%',
  },
  loaderContent: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
  },
  container: {
    alignItems: 'center',
    boxSizing: 'border-box',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  title: {
    color: 'black',
    fontSize: 46,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 24,
    maxWidth: '100%',
    width: 340,
  },
});
