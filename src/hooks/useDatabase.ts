// DB is initialized in root _layout.tsx — this hook always returns ready
export const useDatabase = () => {
  return { isReady: true, error: null };
};
