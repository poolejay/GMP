const { hasAdminConfig, isAdminRequest } = require("../../lib/admin-auth");
const { sendHtml } = require("../../lib/http");
const { COA_PRODUCTS } = require("../../lib/coas");

function pageHtml() {
  const options = COA_PRODUCTS.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin · COA Uploads | Good Morning Peptides</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Zilla+Slab:wght@700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=checkout-3" />
</head>
<body class="admin-body">
  <main class="admin-page">
    <section class="admin-hero">
      <p class="policy-kicker">COA ADMIN</p>
      <h1>Certificate uploads</h1>
      <p>Upload a batch Certificate of Analysis. Each upload creates a line item on the public COA drive with a download link.</p>
    </section>

    <section class="admin-toolbar" style="display:block;">
      <p class="mini-label">Upload a certificate</p>
      <form data-coa-form class="coa-upload-form" style="margin-top:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;">
        <label class="checkout-field">Product
          <select name="product_id" required>${options}</select>
        </label>
        <label class="checkout-field">Lot number
          <input name="lot" placeholder="GMP-2605-GLP3RT30" required />
        </label>
        <label class="checkout-field">Test date
          <input name="test_date" type="date" />
        </label>
        <label class="checkout-field">Purity
          <input name="purity" placeholder="99.4%" />
        </label>
        <label class="checkout-field">Test method
          <input name="method" placeholder="HPLC + MS" />
        </label>
        <label class="checkout-field">Status
          <select name="status"><option>Released</option><option>Pending</option></select>
        </label>
        <label class="checkout-field checkout-field-wide" style="grid-column:1/-1;">Certificate PDF
          <input name="file" type="file" accept="application/pdf" required />
        </label>
        <div style="grid-column:1/-1;display:flex;gap:12px;align-items:center;">
          <button class="button button-primary" type="submit" data-coa-submit>Upload certificate</button>
          <span data-coa-msg class="fine-print"></span>
        </div>
      </form>
    </section>

    <section class="admin-state" data-coa-state>Loading certificates...</section>
    <section class="admin-orders" data-coa-list></section>
  </main>

  <script>
    const form = document.querySelector('[data-coa-form]');
    const submit = document.querySelector('[data-coa-submit]');
    const msg = document.querySelector('[data-coa-msg]');
    const state = document.querySelector('[data-coa-state]');
    const list = document.querySelector('[data-coa-list]');

    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];});}

    function fileToBase64(file){
      return new Promise(function(resolve,reject){
        const reader = new FileReader();
        reader.onload = function(){resolve(String(reader.result).split(',')[1]);};
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function loadList(){
      try {
        const res = await fetch('/api/admin/coas');
        if(!res.ok) throw new Error('load failed');
        const data = await res.json();
        const coas = data.coas || [];
        state.textContent = coas.length ? (coas.length + ' certificate' + (coas.length===1?'':'s') + ' published') : 'No certificates uploaded yet.';
        list.innerHTML = coas.map(function(c){
          return '<article class="admin-order-card" style="display:flex;justify-content:space-between;align-items:center;gap:18px;">'
            + '<div><strong>' + esc(c.product_name) + '</strong> · <span style="font-family:ui-monospace,Menlo,monospace;">' + esc(c.lot) + '</span>'
            + '<p style="margin-top:6px;color:var(--muted);font-size:.84rem;">' + [c.test_date,c.purity,c.method,c.status].filter(Boolean).map(esc).join(' · ') + '</p></div>'
            + '<div style="display:flex;gap:10px;">'
            + '<a class="button button-secondary" href="' + esc(c.file_url) + '" target="_blank" rel="noopener">View PDF</a>'
            + '<button class="button" style="background:#f8e7e1;color:#8c2d19;" data-del="' + esc(c.id) + '">Delete</button>'
            + '</div></article>';
        }).join('');
      } catch(e){
        state.textContent = 'Unable to load certificates.';
      }
    }

    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      msg.textContent = '';
      const file = form.file.files[0];
      if(!file){ msg.textContent = 'Choose a PDF.'; return; }
      submit.disabled = true; submit.textContent = 'Uploading...';
      try {
        const file_base64 = await fileToBase64(file);
        const payload = {
          product_id: form.product_id.value,
          lot: form.lot.value,
          test_date: form.test_date.value,
          purity: form.purity.value,
          method: form.method.value,
          status: form.status.value,
          file_name: file.name,
          file_base64: file_base64,
        };
        const res = await fetch('/api/admin/coas', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data = await res.json().catch(function(){return {};});
        if(!res.ok) throw new Error(data.error || 'Upload failed');
        form.reset();
        msg.textContent = 'Uploaded.';
        loadList();
      } catch(e){
        msg.textContent = e.message || 'Upload failed';
      } finally {
        submit.disabled = false; submit.textContent = 'Upload certificate';
      }
    });

    list.addEventListener('click', async function(ev){
      const btn = ev.target.closest('[data-del]');
      if(!btn) return;
      if(!confirm('Delete this certificate?')) return;
      btn.disabled = true;
      try {
        const res = await fetch('/api/admin/coas/' + encodeURIComponent(btn.dataset.del), {method:'DELETE'});
        if(!res.ok) throw new Error('delete failed');
        loadList();
      } catch(e){ btn.disabled = false; }
    });

    loadList();
  </script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (!hasAdminConfig()) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Admin authentication is not configured");
  }
  if (!isAdminRequest(req)) {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", 'Basic realm="Good Morning Peptides Admin"');
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Admin authentication required");
  }
  return sendHtml(res, 200, pageHtml());
};
