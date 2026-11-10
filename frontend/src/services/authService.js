import api from './api';

export const registerUser = async (payload) => (await api.post('/auth/register', payload)).data;
export const loginUser = async (payload) => (await api.post('/auth/login', payload)).data;
export const fetchMe = async () => (await api.get('/auth/me')).data;
export const updateProfile = async (payload) => (await api.put('/users/profile', payload)).data;
export const fetchStats = async () => (await api.get('/users/stats')).data;
