"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  AnySessionEvent,
  SessionConversationState,
} from "@ai-systems/shared-types";
import {
  reduceSessionEvent,
  createInitialConversationState,
} from "@hhopkins/agent-converters";

export type ConverterType = "opencode" | "claude-sdk";

export interface StepperData {
  rawEvents: unknown[];
  sessionEventsByStep: AnySessionEvent[][];
  /** Optional final state (used for transcript mode where we don't have individual events) */
  finalState?: SessionConversationState;
}

export interface StepperState {
  /** All raw events from the fixture */
  rawEvents: unknown[];
  /** Session events produced by each raw event */
  sessionEventsByStep: AnySessionEvent[][];
  /** Precomputed state at each step (index 0 = initial, index n = after rawEvents[n-1]) */
  statesAtEachStep: SessionConversationState[];
  /** Current step position (0 = before any events, n = after rawEvents[n-1]) */
  currentStep: number;
  /** Whether auto-play is active */
  isPlaying: boolean;
  /** Playback speed multiplier */
  playbackSpeed: number;
  /** Total number of steps (rawEvents.length) */
  totalSteps: number;
}

export interface UseEventStepperResult {
  state: StepperState;
  /** Load new data and precompute states */
  loadData: (data: StepperData) => void;
  /** Step forward by one raw event */
  stepForward: () => void;
  /** Step backward by one raw event */
  stepBackward: () => void;
  /** Jump to the start (step 0) */
  jumpToStart: () => void;
  /** Jump to the end (after all events) */
  jumpToEnd: () => void;
  /** Jump to a specific step */
  jumpToStep: (step: number) => void;
  /** Start auto-play */
  play: () => void;
  /** Pause auto-play */
  pause: () => void;
  /** Toggle play/pause */
  togglePlay: () => void;
  /** Set playback speed */
  setSpeed: (speed: number) => void;
  /** Current raw event (null if at step 0) */
  currentRawEvent: unknown | null;
  /** Session events produced by current raw event */
  currentSessionEvents: AnySessionEvent[];
  /** Current conversation state */
  currentState: SessionConversationState;
  /** Whether data is loaded */
  isLoaded: boolean;
}

const INITIAL_STATE: StepperState = {
  rawEvents: [],
  sessionEventsByStep: [],
  statesAtEachStep: [createInitialConversationState()],
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 1,
  totalSteps: 0,
};

/**
 * Hook for stepping through converter events one at a time.
 *
 * Precomputes all intermediate states on load so stepping/scrubbing is instant.
 */
export function useEventStepper(): UseEventStepperResult {
  const [state, setState] = useState<StepperState>(INITIAL_STATE);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Precompute all intermediate states when data is loaded
  const loadData = useCallback((data: StepperData) => {
    const { rawEvents, sessionEventsByStep, finalState } = data;
    const statesAtEachStep: SessionConversationState[] = [];

    // If we have a finalState but no events (transcript mode), use it directly
    if (finalState && rawEvents.length === 0) {
      statesAtEachStep.push(finalState);
      setState({
        rawEvents: [],
        sessionEventsByStep: [],
        statesAtEachStep,
        currentStep: 0,
        isPlaying: false,
        playbackSpeed: 1,
        totalSteps: 0,
      });
      return;
    }

    // Initial state (before any events)
    let currentState = createInitialConversationState();
    statesAtEachStep.push(currentState);

    // Compute state after each raw event
    for (let i = 0; i < rawEvents.length; i++) {
      const eventsForStep = sessionEventsByStep[i] || [];
      for (const sessionEvent of eventsForStep) {
        currentState = reduceSessionEvent(currentState, sessionEvent);
      }
      statesAtEachStep.push(currentState);
    }

    setState({
      rawEvents,
      sessionEventsByStep,
      statesAtEachStep,
      currentStep: 0,
      isPlaying: false,
      playbackSpeed: 1,
      totalSteps: rawEvents.length,
    });
  }, []);

  const stepForward = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= prev.totalSteps) return prev;
      return { ...prev, currentStep: prev.currentStep + 1 };
    });
  }, []);

  const stepBackward = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 0) return prev;
      return { ...prev, currentStep: prev.currentStep - 1 };
    });
  }, []);

  const jumpToStart = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: 0, isPlaying: false }));
  }, []);

  const jumpToEnd = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: prev.totalSteps,
      isPlaying: false,
    }));
  }, []);

  const jumpToStep = useCallback((step: number) => {
    setState((prev) => {
      const clampedStep = Math.max(0, Math.min(step, prev.totalSteps));
      return { ...prev, currentStep: clampedStep };
    });
  }, []);

  const play = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, playbackSpeed: speed }));
  }, []);

  // Auto-play effect
  useEffect(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }

    if (state.isPlaying) {
      const intervalMs = 500 / state.playbackSpeed;
      playIntervalRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.currentStep >= prev.totalSteps) {
            return { ...prev, isPlaying: false };
          }
          return { ...prev, currentStep: prev.currentStep + 1 };
        });
      }, intervalMs);
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [state.isPlaying, state.playbackSpeed]);

  // Derived values
  const currentRawEvent =
    state.currentStep > 0 ? state.rawEvents[state.currentStep - 1] : null;

  const currentSessionEvents =
    state.currentStep > 0
      ? state.sessionEventsByStep[state.currentStep - 1] || []
      : [];

  const currentState =
    state.statesAtEachStep[state.currentStep] || createInitialConversationState();

  // Loaded if we have events OR if we have a finalState with blocks (transcript mode)
  const isLoaded = state.totalSteps > 0 || state.statesAtEachStep[0]?.blocks?.length > 0;

  return {
    state,
    loadData,
    stepForward,
    stepBackward,
    jumpToStart,
    jumpToEnd,
    jumpToStep,
    play,
    pause,
    togglePlay,
    setSpeed,
    currentRawEvent,
    currentSessionEvents,
    currentState,
    isLoaded,
  };
}
