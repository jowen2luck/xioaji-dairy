/**
 * 幕布（Mubu）文件夹递归全量导出脚本（Edge / Chrome 控制台运行修复版）
 * 
 * 核心原理：
 * 1. 采用与幕布前端完全一致的同源请求方式（POST /api/list/get 及 /api/document/get），
 *    使用 URLSearchParams 表单格式编码，完美规避任何跨域（CORS）限制。
 * 2. 自动继承当前 Edge 浏览器中已激活的登录 Cookie，无需人工传 Token。
 * 3. 递归遍历指定文件夹下的所有多级子文件夹与大纲文档，即使未在网页中手动点击打开也能直接拉取完整大纲内容。
 * 4. 保留创建时间、修改时间、完整多级层级路径、代办勾选与批注，最终打包为 ZIP 触发浏览器下载。
 */

(async function exportMubu() {
  const ROOT_FOLDER_ID = 'qr-kbvfkg0';
  const ROOT_FOLDER_NAME = '美好生活';
  console.log(`%c🚀 开始全量备份幕布文件夹【${ROOT_FOLDER_NAME}】...`, 'color:#10b981;font-size:15px;font-weight:bold;');

  // 1. 动态加载 JSZip 打包库
  if (!window.JSZip) {
    console.log('📦 正在加载 JSZip 库...');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const zip = new JSZip();

  // 2. 文件夹查询函数（同源 /api/list/get，表单编码）
  async function fetchFolder(folderId) {
    const form = new URLSearchParams();
    form.append('folderId', folderId);

    const res = await fetch('/api/list/get', {
      method: 'POST',
      body: form
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code === 0 && json.data) {
      return json.data;
    }
    throw new Error(`接口返回异常 (code: ${json.code}, msg: ${json.msg})`);
  }

  // 3. 文档正文大纲查询函数（同源 /api/document/get，表单编码）
  async function fetchDoc(docId) {
    const form = new URLSearchParams();
    form.append('docId', docId);
    form.append('password', '');
    form.append('isFromDocDir', 'true');

    const res = await fetch('/api/document/get', {
      method: 'POST',
      body: form
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code === 0 && json.data) {
      return json.data;
    }
    throw new Error(`接口返回异常 (code: ${json.code}, msg: ${json.msg})`);
  }

  // 格式化时间戳
  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // 4. 大纲树解析与 Markdown 生成
  function convertToMarkdown(docMeta, docDetail) {
    const title = docMeta.name || (docDetail ? docDetail.name : '未命名文档');
    const createdStr = formatDate(docMeta.created || (docDetail ? docDetail.created : 0));
    const updatedStr = formatDate(docMeta.updated || (docDetail ? docDetail.updated : 0));
    const docId = docMeta.id;

    let md = `---\ntitle: "${(title || '').replace(/"/g, '\\"')}"\nid: "${docId}"\ncreated: "${createdStr}"\nupdated: "${updatedStr}"\npath: "${docMeta._fullPath}"\nmubu_url: "https://mubu.com/app/edit/home/${docId}"\n---\n\n# ${title}\n\n`;

    if (!docDetail || !docDetail.definition) return md + '(文档内容为空)\n';

    let def;
    try {
      def = typeof docDetail.definition === 'string' ? JSON.parse(docDetail.definition) : docDetail.definition;
    } catch (e) {
      return md + '(大纲解析失败)\n';
    }

    const rawNodes = def.nodes || [];
    if (!rawNodes || !rawNodes.length) return md + '(大纲无节点)\n';

    // 建立节点索引，适配 ID 引用树
    const nodeMap = {};
    if (Array.isArray(rawNodes)) {
      rawNodes.forEach(n => { if (n && n.id) nodeMap[n.id] = n; });
    }

    function renderNode(node, level) {
      if (!node) return '';
      if (typeof node === 'string') {
        node = nodeMap[node];
        if (!node) return '';
      }
      const indent = '  '.repeat(level);
      let text = (node.text || '').replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
      let prefix = '- ';
      if (node.finish !== undefined && node.finish !== null) {
        prefix = node.finish ? '- [x] ' : '- [ ] ';
      } else if (node.checked !== undefined && node.checked !== null) {
        prefix = node.checked ? '- [x] ' : '- [ ] ';
      }
      let out = `${indent}${prefix}${text}\n`;

      if (node.children && Array.isArray(node.children)) {
        for (let ch of node.children) {
          out += renderNode(ch, level + 1);
        }
      }
      if (node.note) {
        let cleanNote = node.note.replace(/<[^>]+>/g, '').trim();
        out += `${indent}  > ${cleanNote}\n`;
      }
      return out;
    }

    for (let n of rawNodes) {
      if (n.children && Array.isArray(n.children) && n.children.length > 0) {
        for (let ch of n.children) {
          md += renderNode(ch, 0);
        }
      } else {
        md += renderNode(n, 0);
      }
    }
    return md;
  }

  // 5. 递归遍历目录树
  let totalDocs = 0;
  let totalFolders = 0;
  let failedDocs = 0;
  const safeName = (n) => (n || 'untitled').replace(/[/\\?%*:|"<>]/g, '_').trim();

  async function traverse(folderId, currentPath) {
    totalFolders++;
    console.log(`📁 正在扫描目录 [${totalFolders}]: ${currentPath}`);

    let data;
    try {
      data = await fetchFolder(folderId);
    } catch (err) {
      console.error(`  ❌ 扫描文件夹失败: ${currentPath}`, err);
      return;
    }

    const folders = data.folders || [];
    const documents = data.documents || data.docs || [];

    for (let doc of documents) {
      totalDocs++;
      doc._fullPath = `${currentPath}/${doc.name}`;
      console.log(`  📄 [${totalDocs}] 正在导出: ${doc.name}`);

      try {
        const detail = await fetchDoc(doc.id);
        const mdContent = convertToMarkdown(doc, detail);
        const fileName = `${safeName(doc.name)}.md`;
        zip.file(`${currentPath}/${fileName}`, mdContent);
      } catch (err) {
        failedDocs++;
        console.error(`  ❌ 导出文档失败: ${doc.name}`, err);
      }

      // 防抖延时 100ms
      await new Promise(r => setTimeout(r, 100));
    }

    for (let sub of folders) {
      await traverse(sub.id, `${currentPath}/${safeName(sub.name)}`);
    }
  }

  // 6. 执行与打包下载
  await traverse(ROOT_FOLDER_ID, ROOT_FOLDER_NAME);
  console.log(`\n%c🎉 扫描完成！共扫描 ${totalFolders} 个文件夹，成功抓取 ${totalDocs - failedDocs} 篇文档（失败: ${failedDocs}）。正在生成 ZIP 压缩包...`, 'color:#3b82f6;font-size:14px;font-weight:bold;');

  const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (metadata.percent % 25 === 0) console.log(`压缩打包进度: ${metadata.percent.toFixed(0)}%`);
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `${ROOT_FOLDER_NAME}_幕布全量备份_${dateTag}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`%c✅ 下载已触发: ${a.download}！解压后即可获得完整的文件夹树与 Markdown 文件。`, 'color:#10b981;font-size:15px;font-weight:bold;');
})();
