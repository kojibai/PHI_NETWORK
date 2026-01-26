function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const finalizeResolve = () => {
      if (settled) return;
      settled = true;
      resolve(img);
    };

    const finalizeReject = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    img.onload = () => finalizeResolve();
    img.onerror = () => finalizeReject(new Error("Failed to load SVG image"));
    img.decoding = "async";
    img.src = url;

    if (typeof img.decode === "function") {
      img
        .decode()
        .then(() => finalizeResolve())
        .catch(() => {
          if (!settled) finalizeResolve();
        });
    }
  });
}

export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable");
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to encode PNG"));
      }, "image/png");
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
