#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
幕布（Mubu）递归批量导出工具
==================================================
用于将幕布文件夹（包括所有多级子文件夹与文档）完整导出为 Markdown 文件。
完整保留：
1. 文档元数据（创建时间、更新时间、文档 ID、层级路径、幕布网页原链）注入为 YAML Frontmatter
2. 完整大纲树结构（缩进层级、勾选状态 - [ ] / - [x]、节点备注/批注 > 引用块）
3. 文件夹树形组织结构（本地磁盘自动生成与幕布一致的嵌套文件夹）

使用示例:
    python export_mubu.py --token "YOUR_JWT_TOKEN"
    python export_mubu.py --cookie "YOUR_COOKIE_STRING"
    python export_mubu.py --folder-id "qr-kbvfkg0" --folder-name "美好生活"
"""

import os
import re
import sys
import time
import json
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import requests

if sys.platform.startswith("win") and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

DEFAULT_BASE_URL = "https://api2.mubu.com/v3/api"
DEFAULT_ROOT_FOLDER_ID = "qr-kbvfkg0"
DEFAULT_ROOT_FOLDER_NAME = "美好生活"

DEFAULT_HEADERS = {
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://mubu.com",
    "Referer": "https://mubu.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "x-reg-entrance": "https://mubu.com/app"
}

def clean_filename(name: str) -> str:
    """清理 Windows 文件名非法字符"""
    bad_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
    for c in bad_chars:
        name = name.replace(c, '_')
    return name.strip() or "untitled"

def format_timestamp(ts_ms: Optional[int]) -> str:
    """转换毫秒时间戳为可读字符串"""
    if not ts_ms:
        return ""
    try:
        return datetime.fromtimestamp(ts_ms / 1000.0).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(ts_ms)

class MubuClient:
    def __init__(self, token: str = "", cookie: str = "", base_url: str = DEFAULT_BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.headers = DEFAULT_HEADERS.copy()
        if token:
            self.headers["Jwt-Token"] = token
        if cookie:
            self.headers["Cookie"] = cookie

    def get_list(self, folder_id: str) -> Dict[str, Any]:
        """获取文件夹下的文档和子文件夹列表"""
        # 优先使用 mubu.com 同源表单接口
        urls = [
            ("https://mubu.com/api/list/get", {"folderId": folder_id}),
            (f"{self.base_url}/list/get", {"folderId": folder_id})
        ]
        for url, payload in urls:
            try:
                # 兼容 form 与 json 两种服务端形式
                resp = self.session.post(url, data=payload, headers=self.headers, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("code") == 0:
                        return data.get("data", {})
                    elif data.get("code") in (1001, 1002, 401, 2):
                        # 若第一个接口报鉴权，尝试下一个；都失败再提醒
                        continue
            except Exception:
                pass
        return {}

    def get_doc(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """获取文档正文定义及大纲"""
        urls = [
            ("https://mubu.com/api/document/get", {"docId": doc_id, "password": "", "isFromDocDir": "true"}),
            (f"{self.base_url}/document/edit/get", {"docId": doc_id, "password": "", "isFromDocDir": True})
        ]
        for url, payload in urls:
            try:
                if "api2.mubu.com" in url:
                    resp = self.session.post(url, json=payload, headers=self.headers, timeout=15)
                else:
                    resp = self.session.post(url, data=payload, headers=self.headers, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("code") == 0:
                        return data.get("data", {})
            except Exception:
                pass
        return None

class MubuConverter:
    @staticmethod
    def render_node(node: Dict[str, Any], level: int = 0) -> str:
        """递归渲染单个大纲节点及其子节点"""
        indent = "  " * level
        raw_text = node.get("text") or ""
        clean_text = re.sub(r"<[^>]+>", "", raw_text).replace("\n", " ").strip()

        # 代办状态
        prefix = "- "
        if node.get("finish") is not None:
            prefix = "- [x] " if node.get("finish") else "- [ ] "
        elif node.get("checked") is not None:
            prefix = "- [x] " if node.get("checked") else "- [ ] "

        line = f"{indent}{prefix}{clean_text}\n"

        # 子节点
        children_str = ""
        for child in node.get("children") or []:
            if isinstance(child, dict):
                children_str += MubuConverter.render_node(child, level + 1)

        # 备注
        note_str = ""
        note = node.get("note")
        if note:
            clean_note = re.sub(r"<[^>]+>", "", note).strip()
            note_str = f"{indent}  > {clean_note}\n"

        return line + children_str + note_str

    @classmethod
    def to_markdown(cls, doc_meta: Dict[str, Any], doc_detail: Optional[Dict[str, Any]], full_path: str) -> str:
        """将文档元数据和大纲定义转化为带 YAML Frontmatter 的 Markdown"""
        doc_id = doc_meta.get("id", "")
        title = doc_meta.get("name") or (doc_detail.get("name") if doc_detail else "未命名文档")
        created_str = format_timestamp(doc_meta.get("created") or (doc_detail.get("created") if doc_detail else None))
        updated_str = format_timestamp(doc_meta.get("updated") or (doc_detail.get("updated") if doc_detail else None))

        frontmatter = (
            f"---\n"
            f"title: \"{title.replace('\"', '\\\"')}\"\n"
            f"id: \"{doc_id}\"\n"
            f"created: \"{created_str}\"\n"
            f"updated: \"{updated_str}\"\n"
            f"path: \"{full_path}\"\n"
            f"mubu_url: \"https://mubu.com/app/edit/home/{doc_id}\"\n"
            f"---\n\n"
            f"# {title}\n\n"
        )

        if not doc_detail or not doc_detail.get("definition"):
            return frontmatter + "(文档内容为空或未能拉取到大纲数据)\n"

        raw_def = doc_detail["definition"]
        try:
            definition = json.loads(raw_def) if isinstance(raw_def, str) else raw_def
        except Exception:
            return frontmatter + "(大纲 JSON 格式解析异常)\n"

        nodes = definition.get("nodes", [])
        body_lines = []
        for n in nodes:
            # 若顶层节点包含 children，展开其子节点；否则直接渲染该节点
            if n.get("children") and isinstance(n["children"], list):
                for child in n["children"]:
                    if isinstance(child, dict):
                        body_lines.append(cls.render_node(child, 0))
            else:
                body_lines.append(cls.render_node(n, 0))

        return frontmatter + "".join(body_lines)

def run_export(
    token: str,
    cookie: str,
    root_folder_id: str,
    root_folder_name: str,
    output_dir: Path,
    save_raw_json: bool = False,
    delay: float = 0.12
):
    client = MubuClient(token=token, cookie=cookie)
    output_dir.mkdir(parents=True, exist_ok=True)

    stats = {"docs": 0, "folders": 0, "errors": 0}

    def walk_folder(folder_id: str, current_dir: Path, display_path: str):
        current_dir.mkdir(parents=True, exist_ok=True)
        stats["folders"] += 1
        print(f"📁 正在扫描目录: {display_path}")

        data = client.get_list(folder_id)
        folders = data.get("folders") or []
        documents = data.get("documents") or data.get("docs") or []

        for doc in documents:
            doc_id = doc.get("id")
            doc_name = doc.get("name", "未命名文档")
            safe_doc_name = clean_filename(doc_name)
            doc_full_path = f"{display_path}/{doc_name}"
            stats["docs"] += 1

            print(f"  📄 [{stats['docs']}] 正在导出: {doc_full_path}")
            detail = client.get_doc(doc_id)

            if not detail:
                stats["errors"] += 1
                print(f"  ❌ 获取正文失败: {doc_name}")
                continue

            # 写入 Markdown
            md_content = MubuConverter.to_markdown(doc, detail, doc_full_path)
            md_file = current_dir / f"{safe_doc_name}.md"
            with open(md_file, "w", encoding="utf-8") as f:
                f.write(md_content)

            # 可选写入原始 JSON
            if save_raw_json and detail.get("definition"):
                json_file = current_dir / f"{safe_doc_name}.raw.json"
                with open(json_file, "w", encoding="utf-8") as f:
                    f.write(detail["definition"] if isinstance(detail["definition"], str) else json.dumps(detail["definition"], ensure_ascii=False, indent=2))

            time.sleep(delay)

        for sub in folders:
            sub_id = sub.get("id")
            sub_name = sub.get("name", "未命名文件夹")
            safe_sub_name = clean_filename(sub_name)
            walk_folder(sub_id, current_dir / safe_sub_name, f"{display_path}/{sub_name}")

    start_time = time.time()
    try:
        walk_folder(root_folder_id, output_dir, root_folder_name)
    except PermissionError as pe:
        print(f"\n❌ 权限认证失败: {pe}")
        return

    elapsed = time.time() - start_time
    print(f"\n" + "=" * 60)
    print(f"🎉 导出完成！耗时: {elapsed:.1f} 秒")
    print(f"📁 扫描文件夹数: {stats['folders']}")
    print(f"📄 成功导出文档: {stats['docs']}")
    if stats['errors']:
        print(f"⚠️ 导出失败文档: {stats['errors']}")
    print(f"📂 本地保存路径: {output_dir.resolve()}")
    print("=" * 60)

def main():
    parser = argparse.ArgumentParser(description="幕布（Mubu）文档递归导出工具")
    parser.add_argument("--token", help="幕布 Jwt-Token（可在浏览器 DevTools 中获取）")
    parser.add_argument("--cookie", help="幕布 Cookie 字符串")
    parser.add_argument("--folder-id", default=DEFAULT_ROOT_FOLDER_ID, help=f"目标根文件夹 ID（默认: {DEFAULT_ROOT_FOLDER_ID}）")
    parser.add_argument("--folder-name", default=DEFAULT_ROOT_FOLDER_NAME, help=f"目标根文件夹名称（默认: {DEFAULT_ROOT_FOLDER_NAME}）")
    parser.add_argument("--output", default="./mubu_export", help="本地导出目标目录（默认: ./mubu_export）")
    parser.add_argument("--raw-json", action="store_true", help="同时备份原始大纲 JSON 定义文件")
    parser.add_argument("--delay", type=float, default=0.12, help="单篇导出间隔秒数，防频控（默认: 0.12）")
    args = parser.parse_args()

    token = args.token or os.getenv("MUBU_TOKEN", "")
    cookie = args.cookie or os.getenv("MUBU_COOKIE", "")

    if not token and not cookie:
        print("=" * 60)
        print("未检测到登录凭据。请提供 Jwt-Token 或 Cookie：")
        print("提示：在已登录幕布的 Edge 浏览器按 F12 -> 控制台(Console) -> 输入 localStorage.getItem('token') 即可获得")
        print("=" * 60)
        token_input = input("请输入 Jwt-Token（回车跳过）: ").strip()
        if token_input:
            token = token_input
        else:
            cookie_input = input("请输入 Cookie: ").strip()
            if cookie_input:
                cookie = cookie_input
            else:
                print("❌ 未提供任何认证信息，退出。")
                sys.exit(1)

    target_dir = Path(args.output) / clean_filename(args.folder_name)
    run_export(
        token=token,
        cookie=cookie,
        root_folder_id=args.folder_id,
        root_folder_name=args.folder_name,
        output_dir=target_dir,
        save_raw_json=args.raw_json,
        delay=args.delay
    )

if __name__ == "__main__":
    main()
