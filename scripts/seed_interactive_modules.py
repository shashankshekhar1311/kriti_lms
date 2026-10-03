from pathlib import Path
import json

ICONS = ("scroll", "shield", "scale", "landmark", "feather")


def pick_type(subject: str, title: str) -> str:
    blob = f"{subject} {title}".lower()
    if any(
        k in blob
        for k in (
            "civics",
            "constitution",
            "rights",
            "government",
            "panchayat",
            "democracy",
        )
    ):
        return "civic_action_lab"
    if any(
        k in blob
        for k in (
            "history",
            "empire",
            "king",
            "dynasty",
            "trade",
            "ancient",
            "medieval",
        )
    ):
        return "historical_investigator"
    if any(
        k in blob
        for k in ("geograph", "climate", "map", "river", "landform", "weather")
    ):
        return "historical_investigator"
    return "decision_dilemma"


def build(title: str, narration: str = "", panels=None, subject: str = "") -> dict:
    title = (title or "This lesson").strip() or "This lesson"
    module_type = pick_type(subject, title)
    role = {
        "decision_dilemma": "Village Council Advisor",
        "historical_investigator": "Junior Historical Investigator",
        "civic_action_lab": "Civic Action Lab Apprentice",
    }[module_type]
    panel_items = []
    for panel in panels or []:
        if not isinstance(panel, dict):
            continue
        for item in panel.get("items") or []:
            text = str(item).strip()
            if text and text not in panel_items:
                panel_items.append(text)
        if len(panel_items) >= 6:
            break
    seeds = panel_items[:4] or [
        f"Key idea from {title}",
        "A viewpoint from someone living through this moment",
        "A place or practice mentioned in the lesson",
        "A consequence that could reshape daily life",
    ]
    while len(seeds) < 3:
        seeds.append(f"Another clue from {title}")
    snip = " ".join((narration or "").split())[:280]
    cards = []
    for i, seed in enumerate(seeds[:4]):
        detail = f"{seed}. Use this evidence to reason about {title}. "
        detail += snip if i == 0 and snip else "Look for cause, effect, and whose lives change."
        cards.append(
            {
                "id": f"clue_{i + 1}",
                "label": seed[:72],
                "detail": detail[:420],
                "icon": ICONS[i % len(ICONS)],
            }
        )
    return {
        "module_type": module_type,
        "scenario_title": f"Explore: {title}",
        "scenario_context": (
            f"You step into the world of {title}. Clues from the lesson are scattered "
            "around you — inspect them carefully, then advise Gyanu on the wisest next "
            "move for the people living through this moment."
        ),
        "role": role,
        "investigation_cards": cards,
        "dilemma_challenge": {
            "prompt": (
                f"Based on what you discovered about {title}, which choice best "
                "protects people while staying true to the chapter's big idea?"
            ),
            "options": [
                {
                    "id": "opt_a",
                    "text": "Choose the path that balances fairness with practical needs",
                    "historical_outcome": (
                        f"Communities that weighed trade-offs carefully around {title} "
                        "often built more durable trust — even when progress felt slow."
                    ),
                    "socratic_feedback": (
                        "Beautiful thinking! You noticed that the best choice is rarely "
                        "the loudest one. Gyanu is proud of how you held fairness and "
                        "reality in the same hand."
                    ),
                    "is_optimal": True,
                },
                {
                    "id": "opt_b",
                    "text": "Rush a bold change without listening to local voices",
                    "historical_outcome": (
                        f"Rushing past local voices around {title} can create short-term "
                        "wins but long-term resistance — a pattern history repeats often."
                    ),
                    "socratic_feedback": (
                        "Courage is valuable — and so is listening. Gyanu asks: whose "
                        "story might you have missed before choosing speed?"
                    ),
                    "is_optimal": False,
                },
                {
                    "id": "opt_c",
                    "text": "Do nothing and wait for someone else to decide",
                    "historical_outcome": (
                        f"Waiting forever around {title} often lets problems deepen, "
                        "especially for people with the least power to wait."
                    ),
                    "socratic_feedback": (
                        "Patience can be wise — but silence can also leave people "
                        "unprotected. What small, careful action might still help?"
                    ),
                    "is_optimal": False,
                },
            ],
        },
    }


def main() -> None:
    count = 0
    for subject in ("SocialScience-Part1-Class-7", "SocialScience-Part2-Class-7"):
        root = Path(r"E:/Kriti/Rendered_Output/Class-7") / subject
        if not root.exists():
            continue
        for lesson_dir in sorted(root.rglob("Micro_Lesson_*")):
            if not lesson_dir.is_dir():
                continue
            sb = lesson_dir / "storyboard.json"
            title = lesson_dir.name.replace("_", " ")
            narration = ""
            panels = []
            raw_mod = None
            if sb.exists():
                data = json.loads(sb.read_text(encoding="utf-8"))
                title = data.get("lesson_title") or title
                narration = data.get("narration_text") or ""
                panels = data.get("panels") or []
                raw_mod = data.get("interactive_module")
            if (
                isinstance(raw_mod, dict)
                and isinstance(raw_mod.get("investigation_cards"), list)
                and len(raw_mod.get("investigation_cards") or []) >= 2
            ):
                module = raw_mod
                for i, card in enumerate(module.get("investigation_cards") or []):
                    if isinstance(card, dict) and card.get("icon") not in ICONS:
                        card["icon"] = ICONS[i % len(ICONS)]
            else:
                module = build(title, narration, panels, subject)
            (lesson_dir / "interactive_module.json").write_text(
                json.dumps(module, indent=2), encoding="utf-8"
            )
            count += 1
    print(f"Wrote {count} interactive_module.json files")


if __name__ == "__main__":
    main()
