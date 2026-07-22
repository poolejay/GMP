// Shared shell + design system for all /admin pages.
// File-manager / database aesthetic: flat rows, hairline dividers,
// monospace data cells, muted chips. Self-contained CSS (no styles.css dependency).

const ADMIN_CSS = `
  :root{
    --bg:#f5f6f4; --panel:#ffffff; --line:#e3e6e0; --line-soft:#eef0ec;
    --ink:#1c211b; --muted:#68705f; --faint:#98a08d;
    --accent:#2f5d3a; --accent-soft:#e8f0e9;
    --danger:#8c2d19; --danger-soft:#f8e7e1;
    --mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{background:var(--bg);color:var(--ink);font:14px/1.45 Inter,-apple-system,'Segoe UI',sans-serif}
  a{color:inherit;text-decoration:none}
  button{font:inherit;cursor:pointer;background:none;border:0;color:inherit}

  .topbar{position:sticky;top:0;z-index:20;background:var(--panel);border-bottom:1px solid var(--line);height:54px;display:flex;align-items:center;gap:22px;padding:0 22px}
  .topbar .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.02em}
  .topbar .brand .logo-chip{display:flex;align-items:center;justify-content:center;background:#0c0247;border-radius:9px;padding:5px 9px;box-shadow:0 4px 10px rgba(12,2,71,.25)}
  .topbar .brand img{height:20px;width:auto;display:block}
  .topbar .brand small{font-weight:600;color:var(--faint);font-size:11px;text-transform:uppercase;letter-spacing:.12em}
  .topnav{display:flex;gap:4px;margin-left:8px}
  .topnav a{padding:6px 12px;border-radius:7px;color:var(--muted);font-weight:600;font-size:13px}
  .topnav a:hover{background:var(--line-soft);color:var(--ink)}
  .topnav a.active{background:var(--accent-soft);color:var(--accent)}
  .topbar .spacer{flex:1}
  .topbar .site-link{font-size:12.5px;color:var(--faint);font-weight:600}
  .topbar .site-link:hover{color:var(--accent)}

  .wrap{max-width:1160px;margin:0 auto;padding:26px 22px 80px}
  .page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
  .page-head h1{font-size:19px;font-weight:700;letter-spacing:-.01em}
  .page-head p{color:var(--muted);font-size:13px;margin-top:3px}
  .head-actions{display:flex;gap:8px;align-items:center}

  .btn{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-weight:600;font-size:13px;color:var(--ink)}
  .btn:hover{border-color:var(--faint)}
  .btn:disabled{opacity:.5;cursor:default}
  .btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
  .btn-primary:hover{border-color:var(--accent);opacity:.92}
  .btn-danger{color:var(--danger)}
  .btn-danger:hover{background:var(--danger-soft);border-color:var(--danger-soft)}
  .btn-ghost{border-color:transparent;background:transparent;color:var(--muted);padding:5px 9px}
  .btn-ghost:hover{background:var(--line-soft);color:var(--ink);border-color:transparent}
  .btn-sm{padding:4px 10px;font-size:12.5px;border-radius:7px}

  .filters{display:flex;gap:4px;flex-wrap:wrap}
  .filters button{padding:5px 11px;border-radius:99px;font-size:12.5px;font-weight:600;color:var(--muted);border:1px solid transparent}
  .filters button:hover{background:var(--line-soft);color:var(--ink)}
  .filters button.active{background:var(--ink);color:#fff}
  .filters button .n{opacity:.55;margin-left:4px;font-variant-numeric:tabular-nums}

  /* file-table */
  .table{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .thead,.trow{display:grid;align-items:center;gap:14px;padding:0 16px}
  .thead{height:36px;background:#fafbf9;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--faint)}
  .trow{min-height:46px;padding-top:7px;padding-bottom:7px;border-top:1px solid var(--line-soft);cursor:default}
  .trow:first-of-type{border-top:0}
  .trow.clickable{cursor:pointer}
  .trow.clickable:hover{background:#fafbf8}
  .trow .primary{font-weight:600}
  .trow .sub{color:var(--muted);font-size:12px;margin-top:1px}
  .mono{font-family:var(--mono);font-size:12.5px;letter-spacing:0}
  .num{font-variant-numeric:tabular-nums}
  .cell-actions{display:flex;gap:2px;justify-content:flex-end}
  .muted{color:var(--muted)} .faint{color:var(--faint)}

  .chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600;background:var(--line-soft);color:var(--muted);white-space:nowrap}
  .chip::before{content:"";width:6px;height:6px;border-radius:99px;background:currentColor;opacity:.7}
  .chip-awaiting_payment{background:#fdf3e2;color:#8a5a12}
  .chip-payment_submitted{background:#e9eefb;color:#2e4d8f}
  .chip-paid,.chip-Released{background:var(--accent-soft);color:var(--accent)}
  .chip-processing{background:#eef;color:#4d3f8f}
  .chip-shipped{background:#e2f2f4;color:#1c6470}
  .chip-cancelled{background:var(--line-soft);color:var(--faint)}
  .chip-refunded,.chip-Pending{background:#fdf3e2;color:#8a5a12}

  .dot{display:inline-block;width:9px;height:9px;border-radius:99px;border:1px solid rgba(0,0,0,.18);vertical-align:-1px}

  .detail{grid-column:1/-1;border-top:1px dashed var(--line);margin-top:8px;padding:14px 2px 6px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;font-size:13px}
  .detail h4{font-size:10.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--faint);margin-bottom:6px}
  .detail ul{list-style:none}
  .detail li{display:flex;justify-content:space-between;gap:10px;padding:2px 0}
  .detail .actions-col{display:flex;flex-direction:column;gap:6px;align-items:stretch}

  .state{padding:16px 2px;color:var(--muted);font-size:13px}
  .state:empty{display:none}

  /* forms */
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
  .form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 14px}
  .field{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--muted)}
  .field input,.field select{font:13px Inter,sans-serif;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
  .field input:focus,.field select:focus{outline:2px solid var(--accent-soft);border-color:var(--accent)}
  .field-wide{grid-column:1/-1}
  .form-foot{grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .msg{font-size:12.5px;color:var(--muted)}

  /* hub */
  .hub{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:6px}
  .hub a{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:8px}
  .hub a:hover{border-color:var(--accent);box-shadow:0 1px 8px rgba(47,93,58,.08)}
  .hub .icon{width:36px;height:36px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center}
  .hub h2{font-size:15px;font-weight:700}
  .hub p{color:var(--muted);font-size:12.5px}
  .hub .stat{margin-top:6px;font-size:12px;color:var(--faint);font-weight:600}
  .hub .stat strong{color:var(--ink);font-size:16px;font-weight:700;margin-right:5px;font-variant-numeric:tabular-nums}

  @media(max-width:820px){
    .thead{display:none}
    .trow{grid-template-columns:1fr auto !important}
    .trow>*{grid-column:auto}
    .hide-sm{display:none}
    .form-grid{grid-template-columns:1fr 1fr}
  }
`;

function adminShell({ title, active, content, script }) {
  const nav = [
    ["/admin", "Overview", "overview"],
    ["/admin/orders", "Orders", "orders"],
    ["/admin/coas", "COAs", "coas"],
  ]
    .map(([href, label, key]) => `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${title} · GMP Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${ADMIN_CSS}</style>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/admin"><span class="logo-chip"><img src="/assets/GMPLogo.png" alt="" onerror="this.parentNode.remove()" /></span><small>Admin</small></a>
    <nav class="topnav">${nav}</nav>
    <span class="spacer"></span>
    <a class="site-link" href="/home.html" target="_blank" rel="noopener">View site ↗</a>
    <button class="site-link" type="button" data-admin-logout style="border:0;background:none;cursor:pointer;">Log out</button>
  </header>
  <main class="wrap">${content}</main>
  <script>
    document.querySelector("[data-admin-logout]").addEventListener("click", async function () {
      // Overwrite the browser's cached Basic credentials with garbage...
      try {
        await fetch("/api/admin/orders", { headers: { Authorization: "Basic " + btoa("logout:" + Date.now()) } });
      } catch (e) {}
      // ...then end the Cloudflare Access session (no-op if Access isn't enabled).
      window.location.href = "/cdn-cgi/access/logout";
    });
  </script>
  <script>${script || ""}</script>
</body>
</html>`;
}

module.exports = { adminShell };
