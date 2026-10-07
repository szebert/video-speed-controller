// SPDX-License-Identifier: GPL-3.0-only

// Structural types shared by regular Zod and Mini. Keep the output indexed by
// endpoint so a generic request retains its response type after safeParse.
export type EndpointResponses<
  T extends Record<string, { response: { parse: (data: unknown) => unknown } }>,
> = {
  [K in keyof T]: ReturnType<T[K]['response']['parse']>;
};

export type ResponseEndpoints<T> = {
  [K in keyof T]: {
    response: {
      safeParse: (data: unknown) => { success: true; data: T[K] } | { success: false };
    };
  };
};
