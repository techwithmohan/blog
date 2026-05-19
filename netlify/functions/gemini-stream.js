exports.handler = async () => {
  return {
    statusCode: 400,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({
      error: {
        message: "Streaming is not supported on this Netlify deploy. Falling back to non-streaming.",
      },
    }),
  };
};

