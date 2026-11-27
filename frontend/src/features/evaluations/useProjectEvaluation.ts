/** Server state of one project's evaluation: stored result, exchange rate in force and the actions on them. */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';

import {
  evaluateProjectApi,
  type ExchangeRate,
  getEvaluationApi,
  getExchangeRatesApi,
  type ManualRate,
  type ProjectEvaluation,
  registerManualRateApi,
} from './api';

export function useProjectEvaluation(projectId: string, canViewResults: boolean) {
  const { conSesion } = useSesion();
  const [evaluation, setEvaluation] = useState<ProjectEvaluation | null>(null);
  const [rates, setRates] = useState<ExchangeRate[] | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(canViewResults);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const loadRates = useCallback(async () => {
    try {
      setRates(await conSesion(getExchangeRatesApi));
      setRatesError(null);
    } catch (e) {
      setRates([]);
      setRatesError(mensajeDeError(e));
    }
  }, [conSesion]);

  const loadEvaluation = useCallback(async () => {
    if (!canViewResults) return;
    setLoading(true);
    try {
      setEvaluation(await conSesion(getEvaluationApi(projectId)));
      setError(null);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 404) setEvaluation(null);
      else setError(mensajeDeError(e));
    } finally {
      setLoading(false);
    }
  }, [canViewResults, conSesion, projectId]);

  useEffect(() => {
    // Deferred so the effect itself never sets state while rendering.
    const start = setTimeout(() => {
      void loadRates();
      void loadEvaluation();
    }, 0);
    return () => clearTimeout(start);
  }, [loadRates, loadEvaluation]);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const run = async (proposalIds?: string[]): Promise<boolean> => {
    if (busy.current) return false; // a ref: a double tap arrives before the state updates
    busy.current = true;
    setElapsed(0);
    setRunning(true);
    setError(null);
    try {
      setEvaluation(await conSesion(evaluateProjectApi(projectId, proposalIds)));
      void loadRates();
      return true;
    } catch (e) {
      setError(mensajeDeError(e));
      return false;
    } finally {
      busy.current = false;
      setRunning(false);
    }
  };

  const saveRate = async (rate: ManualRate): Promise<string | null> => {
    try {
      await conSesion(registerManualRateApi(rate));
      await loadRates();
      return null;
    } catch (e) {
      return mensajeDeError(e);
    }
  };

  return { evaluation, rates, ratesError, loading, running, elapsed, error, run, saveRate, reload: loadEvaluation };
}
