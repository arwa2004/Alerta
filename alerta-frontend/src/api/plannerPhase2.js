import axiosClient from './axiosClient';

// Reuse the exact same base URL logic as plannerApi.js
const PLANNER_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'}/planner/`;
const opts = (extra = {}) => ({ baseURL: PLANNER_BASE, ...extra });

export const analyzeFloorPlan = (floorPlanId) =>
  axiosClient.post(`floor-plans/${floorPlanId}/analyze/`, {}, opts()).then((r) => r.data);

export const getFloorPlanAnalysis = (floorPlanId) =>
  axiosClient.get(`floor-plans/${floorPlanId}/analysis/`, opts()).then((r) => r.data);

export const optimizeCameras = (projectId, payload) =>
  axiosClient.post(`projects/${projectId}/optimize/`, payload, opts()).then((r) => r.data);

export const listOptimizations = (projectId) =>
  axiosClient.get(`projects/${projectId}/optimizations/`, opts()).then((r) => r.data);

export const getOptimization = (optimizationId) =>
  axiosClient.get(`optimizations/${optimizationId}/`, opts()).then((r) => r.data);