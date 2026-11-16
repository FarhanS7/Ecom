import os
import sys

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "implementation", "tasks")
os.makedirs(OUTPUT_DIR, exist_ok=True)

print(f"Generating tasks into {OUTPUT_DIR}...")
