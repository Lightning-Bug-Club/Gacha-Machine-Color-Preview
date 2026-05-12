#!/usr/bin/env python3
"""
convert.py — STL → GLB conversion and optimization pipeline
for the Gacha Machine Color Configurator.

Usage examples:
  python convert.py input.stl
  python convert.py input.stl --output models/my-machine.glb
  python convert.py --dir ./stl_files
  python convert.py --dir ./stl_files --decimate 0.5
  python convert.py input.stl --decimate 0.3 --output models/gacha-machine.glb
"""

import argparse
import sys
import os
from pathlib import Path


def _require_trimesh():
    """Import trimesh, giving a friendly error if it is not installed."""
    try:
        import trimesh  # noqa: F401
        return trimesh
    except ImportError:
        print(
            "[ERROR] 'trimesh' is not installed.\n"
            "        Run:  pip install -r requirements.txt",
            file=sys.stderr,
        )
        sys.exit(1)


def convert_stl(
    input_path: Path,
    output_path: Path,
    decimate_ratio: float | None = None,
) -> dict:
    """
    Load an STL file, optionally decimate it, and export to GLB.

    Parameters
    ----------
    input_path    : Path to the source .stl file.
    output_path   : Path for the output .glb file.
    decimate_ratio: Float in (0, 1] — fraction of faces to keep.
                    If None or 1.0, no decimation is applied.

    Returns
    -------
    A dict with summary statistics.
    """
    trimesh = _require_trimesh()

    print(f"\n[INFO] Loading  : {input_path}")

    # Load mesh — trimesh.load returns a Trimesh or Scene
    mesh = trimesh.load(str(input_path), force="mesh")

    if not hasattr(mesh, "faces"):
        raise ValueError(
            f"Could not interpret '{input_path}' as a single mesh."
        )

    verts_before = len(mesh.vertices)
    faces_before = len(mesh.faces)
    print(f"       Vertices : {verts_before:,}   Faces: {faces_before:,}")

    # --- Optional decimation ---
    verts_after = verts_before
    faces_after = faces_before

    if decimate_ratio is not None and 0.0 < decimate_ratio < 1.0:
        target_faces = max(4, int(faces_before * decimate_ratio))
        print(
            f"[INFO] Decimating to ~{target_faces:,} faces "
            f"({decimate_ratio:.0%} of original) …"
        )
        try:
            # simplify_quadric_decimation is available in trimesh >= 3.10
            mesh = mesh.simplify_quadric_decimation(target_faces)
        except AttributeError:
            print(
                "[WARN] trimesh.simplify_quadric_decimation not available; "
                "skipping decimation. Upgrade trimesh to enable it.",
                file=sys.stderr,
            )
        verts_after = len(mesh.vertices)
        faces_after = len(mesh.faces)
        print(f"       → Vertices: {verts_after:,}   Faces: {faces_after:,}")
    elif decimate_ratio == 1.0 or decimate_ratio is None:
        print("[INFO] No decimation requested.")
    else:
        print(
            f"[WARN] Invalid decimate ratio {decimate_ratio!r} — "
            "must be in (0, 1].  Skipping decimation.",
            file=sys.stderr,
        )

    # --- Ensure output directory exists ---
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # --- Export to GLB ---
    print(f"[INFO] Exporting: {output_path}")
    mesh.export(str(output_path))

    size_kb = output_path.stat().st_size / 1024
    print(f"[OK]   Saved {size_kb:.1f} KB → {output_path}\n")

    return {
        "input": str(input_path),
        "output": str(output_path),
        "verts_before": verts_before,
        "faces_before": faces_before,
        "verts_after": verts_after,
        "faces_after": faces_after,
        "size_kb": size_kb,
    }


def process_directory(
    directory: Path,
    output_dir: Path,
    decimate_ratio: float | None,
) -> list[dict]:
    """Convert all STL files found in *directory*."""
    stl_files = sorted(directory.glob("*.stl")) + sorted(directory.glob("*.STL"))

    if not stl_files:
        print(f"[WARN] No STL files found in '{directory}'.", file=sys.stderr)
        return []

    results = []
    for stl in stl_files:
        out = output_dir / (stl.stem + ".glb")
        try:
            results.append(convert_stl(stl, out, decimate_ratio))
        except Exception as exc:  # noqa: BLE001
            print(f"[ERROR] Failed to convert {stl}: {exc}", file=sys.stderr)

    return results


def print_summary(results: list[dict]) -> None:
    """Print a human-readable conversion summary table."""
    if not results:
        print("[INFO] No files were converted.")
        return

    print("\n" + "=" * 68)
    print(f"  Conversion Summary ({len(results)} file(s))")
    print("=" * 68)
    for r in results:
        reduction = ""
        if r["faces_before"] > 0 and r["faces_after"] != r["faces_before"]:
            pct = 100.0 * (1 - r["faces_after"] / r["faces_before"])
            reduction = f"  (↓ {pct:.1f}% faces)"
        print(f"  IN  : {r['input']}")
        print(f"  OUT : {r['output']}  [{r['size_kb']:.1f} KB]{reduction}")
        print(
            f"        Verts {r['verts_before']:,} → {r['verts_after']:,}   "
            f"Faces {r['faces_before']:,} → {r['faces_after']:,}"
        )
        print()
    print("=" * 68)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert STL file(s) to GLB for the Gacha Machine viewer.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Positional / optional input
    parser.add_argument(
        "input",
        nargs="?",
        help="Path to a single STL file to convert.",
    )
    parser.add_argument(
        "--dir",
        metavar="DIRECTORY",
        help="Process all STL files in this directory.",
    )
    parser.add_argument(
        "--output", "-o",
        metavar="FILE",
        help=(
            "Output GLB file path (only used with a single input file). "
            "Defaults to models/<stem>.glb."
        ),
    )
    parser.add_argument(
        "--decimate",
        metavar="RATIO",
        type=float,
        help=(
            "Fraction of faces to keep after decimation, e.g. 0.5 keeps "
            "50%% of faces.  Values in (0, 1).  Default: no decimation."
        ),
    )
    parser.add_argument(
        "--models-dir",
        metavar="DIR",
        default="models",
        help="Output directory for GLB files when using --dir.  (default: models/)",
    )

    args = parser.parse_args()

    # Validate mutual exclusion
    if args.input and args.dir:
        parser.error("Provide either a single input file OR --dir, not both.")

    if not args.input and not args.dir:
        parser.error("Provide a single input file or use --dir.")

    results: list[dict] = []

    if args.input:
        # Single-file mode
        input_path = Path(args.input)
        if not input_path.is_file():
            print(f"[ERROR] File not found: {input_path}", file=sys.stderr)
            sys.exit(1)

        if args.output:
            output_path = Path(args.output)
        else:
            output_path = Path(args.models_dir) / (input_path.stem + ".glb")

        try:
            result = convert_stl(input_path, output_path, args.decimate)
            results.append(result)
        except Exception as exc:  # noqa: BLE001
            print(f"[ERROR] {exc}", file=sys.stderr)
            sys.exit(1)

    elif args.dir:
        # Directory mode
        directory = Path(args.dir)
        if not directory.is_dir():
            print(f"[ERROR] Directory not found: {directory}", file=sys.stderr)
            sys.exit(1)
        output_dir = Path(args.models_dir)
        results = process_directory(directory, output_dir, args.decimate)

    print_summary(results)


if __name__ == "__main__":
    main()
