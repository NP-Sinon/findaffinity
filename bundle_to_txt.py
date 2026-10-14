import base64
import io
import os
import zipfile

root_dir = os.path.abspath(r"E:\Games\Proyecto")
txt_compressed_path = os.path.join(root_dir, "proyecto_comprimido.txt")
txt_plain_path = os.path.join(root_dir, "proyecto_completo.txt")

exclude_dirs = {".pytest_cache", "__pycache__", ".git", "venv", ".idea", ".vscode", "node_modules", "dist"}
files_to_pack = []

for dirpath, dirnames, filenames in os.walk(root_dir):
    dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
    for f in filenames:
        if f in ("proyecto_comprimido.txt", "proyecto_completo.txt", "package-lock.json"):
            continue
        ext = os.path.splitext(f)[1].lower()
        valid_exts = (".py", ".md", ".txt", ".json", ".csv", ".xlsx", ".jsx", ".js", ".ts", ".tsx", ".html", ".css", ".svg", ".n43", ".yaml", ".yml", ".sh", ".bat", ".ps1")
        valid_names = ("Dockerfile", ".dockerignore", ".env.example", ".gitignore")
        if ext in valid_exts or f in valid_names:
            rel_path = os.path.relpath(os.path.join(dirpath, f), root_dir)
            files_to_pack.append(rel_path)

# 1. Crear ZIP en memoria
zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
    for rel_path in sorted(files_to_pack):
        full_path = os.path.join(root_dir, rel_path)
        zipf.write(full_path, rel_path)

zip_bytes = zip_buffer.getvalue()
b64_zip = base64.b64encode(zip_bytes).decode("ascii")

# 2. Generar proyecto_comprimido.txt (ZIP codificado en Base64 con instrucciones)
with open(txt_compressed_path, "w", encoding="utf-8") as f:
    f.write("# ==============================================================================\n")
    f.write("# MICRO-SAAS RECONCILIACIÓN CONTABLE - PROYECTO COMPRIMIDO (ZIP BASE64)\n")
    f.write("# ==============================================================================\n")
    f.write("#\n")
    f.write("# Instrucciones para descomprimir este archivo:\n")
    f.write("#\n")
    f.write("# Opción A (PowerShell de Windows):\n")
    f.write('#   $b64 = (Get-Content "proyecto_comprimido.txt" | Where-Object { -not $_.StartsWith("#") }) -join ""\n')
    f.write('#   [IO.File]::WriteAllBytes("proyecto.zip", [Convert]::FromBase64String($b64))\n')
    f.write('#   Expand-Archive -Path "proyecto.zip" -DestinationPath "." -Force\n')
    f.write("#\n")
    f.write("# Opción B (Python):\n")
    f.write('#   import base64, zipfile, io\n')
    f.write('#   with open("proyecto_comprimido.txt", "r", encoding="utf-8") as f:\n')
    f.write('#       b64 = "".join(l.strip() for l in f if not l.startswith("#"))\n')
    f.write('#   zipfile.ZipFile(io.BytesIO(base64.b64decode(b64))).extractall(".")\n')
    f.write("#\n")
    f.write("# --- INICIO ARCHIVO COMPRIMIDO BASE64 ---\n")
    for i in range(0, len(b64_zip), 76):
        f.write(b64_zip[i : i + 76] + "\n")
    f.write("# --- FIN ARCHIVO COMPRIMIDO BASE64 ---\n")

# 3. Generar proyecto_completo.txt (Texto plano de todos los archivos)
with open(txt_plain_path, "w", encoding="utf-8") as f:
    f.write("=" * 80 + "\n")
    f.write("MICRO-SAAS CONCILIACIÓN CONTABLE Y DESAMBIGUACIÓN B2B2B\n")
    f.write("CÓDIGO FUENTE INTEGRAL CONSOLIDADO\n")
    f.write("=" * 80 + "\n\n")
    for rel_path in sorted(files_to_pack):
        full_path = os.path.join(root_dir, rel_path)
        f.write("\n" + "=" * 80 + "\n")
        f.write(f"FICHERO: {rel_path}\n")
        f.write("=" * 80 + "\n\n")
        try:
            with open(full_path, "r", encoding="utf-8") as src:
                f.write(src.read() + "\n")
        except Exception as e:
            f.write(f"# [Error leyendo {rel_path}: {e}]\n")

print(f"Total archivos procesados: {len(files_to_pack)}")
print(f"Tamaño archivo ZIP original: {len(zip_bytes)} bytes")
print(f"Tamaño 'proyecto_comprimido.txt': {os.path.getsize(txt_compressed_path)} bytes")
print(f"Tamaño 'proyecto_completo.txt': {os.path.getsize(txt_plain_path)} bytes")
