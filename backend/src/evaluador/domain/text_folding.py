"""Text normalisation used only to MATCH attack patterns. Never used to rewrite what a person reads.

Pattern filters are trivially evaded with invisible characters, look-alike letters, digits for letters or
spaces between letters. Folding the text first makes those tricks match the same patterns as the plain phrase.
"""

from __future__ import annotations

import re
import unicodedata

# Cyrillic and Greek letters that look like Latin ones.
_CONFUSABLES = str.maketrans(
    {
        "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ѕ": "s", "ј": "j",
        "ο": "o", "α": "a", "ε": "e", "ι": "i", "ν": "v", "ρ": "p", "τ": "t", "υ": "u",
    }
)  # fmt: skip
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})
# "i g n o r a": letters separated by exactly one space become one word.
_SPACED_LETTERS = re.compile(r"(?<![^\W_])(?:[^\W_] ){2,}[^\W_](?![^\W_])")


def strip_invisible(text: str) -> str:
    """Removes zero-width and other format characters (category Cf) that split words without being seen."""
    return "".join(c for c in text if unicodedata.category(c) != "Cf")


def fold_for_matching(text: str) -> str:
    """Lowercase, accent-free, with look-alike letters, leet digits, hidden characters and letter spacing undone."""
    text = strip_invisible(unicodedata.normalize("NFKC", text)).lower()
    text = text.translate(_CONFUSABLES)
    decomposed = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in decomposed if not unicodedata.combining(c)).translate(_LEET)
    text = re.sub(r"(?<=\w)[.\-_*](?=\w)", "", text)  # i.g.n.o.r.a, i-g-n-o-r-a
    text = _SPACED_LETTERS.sub(lambda m: m.group(0).replace(" ", ""), text)
    return " ".join(text.split())
