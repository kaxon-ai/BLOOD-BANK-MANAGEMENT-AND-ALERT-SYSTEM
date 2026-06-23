import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const api = axios.create({ baseURL: BASE, timeout: 15_000 });

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("bb_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("bb_token");
      localStorage.removeItem("bb_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── API helpers ───────────────────────────────────────────────────────
export const auth = {
  login:    (body) => api.post("/api/auth/login", body),
  register: (body) => api.post("/api/auth/register", body),
  me:       ()     => api.get("/api/auth/me"),
};

export const inventory = {
  list:     ()         => api.get("/api/inventory"),
  summary:  ()         => api.get("/api/inventory/summary"),
  expiring: (days=7)   => api.get(`/api/inventory/expiring?days=${days}`),
  add:      (body)     => api.post("/api/inventory", body),
  update:   (id, body) => api.patch(`/api/inventory/${id}`, body),
  remove:   (id)       => api.delete(`/api/inventory/${id}`),
  logUsage: (body)     => api.post("/api/inventory/log-usage", body),
};

export const donors = {
  list:           (params={}) => api.get("/api/donors", { params }),
  get:            (id)        => api.get(`/api/donors/${id}`),
  register:       (body)      => api.post("/api/donors", body),
  update:         (id, body)  => api.patch(`/api/donors/${id}`, body),
  recordDonation: (id, date)  => api.patch(`/api/donors/${id}/record-donation`, { donation_date: date }),
  deactivate:     (id)        => api.delete(`/api/donors/${id}`),
  eligible:       (bt, county) => api.get(`/api/donors/eligible/${encodeURIComponent(bt)}`, { params: { county } }),
};

export const alerts = {
  list:      (params={}) => api.get("/api/alerts", { params }),
  get:       (id)        => api.get(`/api/alerts/${id}`),
  create:    (body)      => api.post("/api/alerts", body),
  approve:   (id)        => api.patch(`/api/alerts/${id}/approve`),
  broadcast: (id)        => api.post(`/api/alerts/${id}/broadcast`),
  cancel:    (id)        => api.patch(`/api/alerts/${id}/cancel`),
};

export const predictions = {
  list:    ()         => api.get("/api/predictions"),
  shortages: ()       => api.get("/api/predictions/shortages"),
  history: (bt, days) => api.get(`/api/predictions/history/${encodeURIComponent(bt)}?days=${days}`),
  run:     ()         => api.post("/api/predictions/run"),
};

export default api;
