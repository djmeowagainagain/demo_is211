import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const getBalance = () => axios.get(`${API}/balance`);

export const withdrawNoLock = (amount) =>
  axios.post(`${API}/withdraw-no-lock`, { amount });

export const withdrawLock = (amount) =>
  axios.post(`${API}/withdraw-lock`, { amount });

export const deadlock1 = () => axios.post(`${API}/transfer-1`);

export const deadlock2 = () => axios.post(`${API}/transfer-2`);
