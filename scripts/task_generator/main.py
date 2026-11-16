import os
import re
import sys

# Ensure this directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import common
import milestone0
import milestone1
import milestone2
import milestone3
import milestone4
import milestone5
import milestone6
import milestone7
import milestone8
import milestone9
import milestone10

def to_kebab(s):
    # Remove non-alphanumeric characters, convert spaces to hyphens, lowercase
    s = re.sub(r'[^a-zA-Z0-9\s-]', '', s)
    s = re.sub(r'[\s_]+', '-', s).strip('-').lower()
    return s

def main():
    root_dir = os.path.dirname(os.path.dirname(current_dir))
    output_dir = os.path.join(root_dir, "implementation", "tasks")
    os.makedirs(output_dir, exist_ok=True)

    all_milestones = [
        ("Milestone 0: Foundation", milestone0.get_tasks()),
        ("Milestone 1: Identity and Stores", milestone1.get_tasks()),
        ("Milestone 2: Catalog and Storefront", milestone2.get_tasks()),
        ("Milestone 3: Events, Search, and Media", milestone3.get_tasks()),
        ("Milestone 4: Carts and Shared Inventory", milestone4.get_tasks()),
        ("Milestone 5: Checkout and Mock Payments", milestone5.get_tasks()),
        ("Milestone 6: Fulfillment and After-Sales", milestone6.get_tasks()),
        ("Milestone 7: Engagement and Administration", milestone7.get_tasks()),
        ("Milestone 8: Reliability and Quality", milestone8.get_tasks()),
        ("Milestone 9: Performance and Scale Evidence", milestone9.get_tasks()),
        ("Milestone 10: Release and Portfolio", milestone10.get_tasks()),
    ]

    total_tasks = 0
    seen_ids = set()

    for m_name, tasks in all_milestones:
        print(f"Processing {m_name} ({len(tasks)} tasks)...")
        for t in tasks:
            tid = t["id"]
            if tid in seen_ids:
                raise ValueError(f"Duplicate task ID: {tid}")
            seen_ids.add(tid)
            
            kebab_name = to_kebab(t["name"])
            filename = f"{tid}-{kebab_name}.md"
            filepath = os.path.join(output_dir, filename)

            content = common.render_task(t)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            total_tasks += 1

    print(f"\nSuccessfully generated {total_tasks} task files into {output_dir}!")

if __name__ == "__main__":
    main()
