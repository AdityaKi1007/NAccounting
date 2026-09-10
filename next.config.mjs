/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  webpack: (config) => {
    // jsPDF lazily `import()`s exactly three optional peers: 'canvg', 'dompurify' and
    // 'html2canvas'. We only ever use the last one — invoice PDFs are built from a PNG
    // snapshot (html2canvas) passed to addImage, so we never touch jsPDF's SVG methods
    // (canvg) or its pdf.html() sanitiser (dompurify). Neither is declared in jsPDF's own
    // dependencies, so neither is guaranteed to be installed or complete, yet webpack still
    // has to statically resolve both at build time to create their lazy chunks — and a
    // missing file anywhere in those trees fails the whole build ("Can't resolve
    // '../internals/try-to-string'" via canvg -> core-js, or "Can't resolve 'dompurify'"
    // when its ESM entry is absent). Aliasing both to false makes webpack skip them
    // entirely on the client and server compiles. Safe: the lazy imports guarded behind
    // them are unreachable from our code. Do NOT add html2canvas here — we import it.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvg: false,
      dompurify: false,
    };
    return config;
  },
};

export default nextConfig;
