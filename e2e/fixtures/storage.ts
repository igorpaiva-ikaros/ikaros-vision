export const supabase = {
  storage: {
    from: () => ({
      upload: async (path: string) => {
        (window as any).qaEvidencePath = path;
        return { error: null };
      },
      remove: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: "about:blank" }, error: null }),
    }),
  },
};

export const backendConfigured = true;
