import React, { createContext, useContext } from 'react';
import * as SQLite from 'expo-sqlite';

const DbContext = createContext<SQLite.SQLiteDatabase | null>(null);

export const DbProvider = DbContext.Provider;

export const useDb = (): SQLite.SQLiteDatabase => {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used within DbProvider');
  return db;
};
