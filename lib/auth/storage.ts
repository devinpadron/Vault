import * as SecureStore from 'expo-secure-store';
import { User } from '@/types';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export async function saveAuth(token: string, user: User): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function loadAuth(): Promise<{ token: string; user: User } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const userJson = await SecureStore.getItemAsync(USER_KEY);
  if (!token || !userJson) return null;
  try {
    const user = JSON.parse(userJson) as User;
    return { token, user };
  } catch {
    return null;
  }
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
