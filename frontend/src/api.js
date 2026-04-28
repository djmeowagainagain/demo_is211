import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const getBalance = () => axios.get(`${API}/balance`);

export const withdrawNoLock = (amount) =>
  axios.post(`${API}/withdraw-no-lock`, { amount });

export const withdrawLock = (amount) =>
  axios.post(`${API}/withdraw-lock`, { amount });

export const deadlock1 = () => axios.post(`${API}/transfer-1`);

export const deadlock2 = () => axios.post(`${API}/transfer-2`);

export const transferOrdered = () => axios.post(`${API}/transfer-ordered`);

export const dirtyRead = () => axios.post(`${API}/dirty-read`);

export const unrepeatableRead = () => axios.post(`${API}/unrepeatable-read`);

export const unrepeatableReadFix = () => axios.post(`${API}/unrepeatable-read-fix`);

export const phantomRead = () => axios.post(`${API}/phantom-read`);

export const phantomReadFix = () => axios.post(`${API}/phantom-read-fix`);

export const timestampDemo = () => axios.post(`${API}/timestamp-demo`);

export const resetDemo = () => axios.post(`${API}/reset-demo`);
