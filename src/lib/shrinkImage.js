// Used by the customer site and the POS
/** Makes a phone screenshot small (max 1080px, JPEG) so it uploads quickly. */
export function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type) || file.size > 15e6) { reject(new Error('bad')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1080 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = 0.75, out = c.toDataURL('image/jpeg', q);
      while (out.length > 650000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      out.length > 680000 ? reject(new Error('big')) : resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad')); };
    img.src = url;
  });
}
