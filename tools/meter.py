"""Scan lyric drafts: syllables, stress shape, and couplet rhymes per line.

Usage: python meter.py FILE [--target 14]
Lines starting with '#', '(' or '**', and blank lines, are skipped. Leading spaces are ignored.
Stress: '/' = stressed syllable, 'x' = unstressed, '.' = one-syllable function word (stress depends on
delivery). Unknown words are guessed by counting vowel groups and shown as '?'.
"""
import re, sys
import pronouncing

FUNCTION = set("""a an the and or but nor so of to in on at by for with from as if than that this these those
i me my you your he him his she her it its we us our they them their is am are was were be been do does did
have has had will would shall should can could may might must not no all till when while where who whom
what which there here then too up out""".split())

def guess_syll(w):
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1 and not w.endswith(("le", "ee")):
        n -= 1
    return max(1, n)

def word_shape(w):
    w = w.lower().strip("'")
    if not w:
        return ""
    ph = pronouncing.phones_for_word(w)
    if not ph and w.endswith("'s"):
        ph = pronouncing.phones_for_word(w[:-2])
    if not ph:
        return "?" * guess_syll(w)
    s = pronouncing.stresses(ph[0])
    if len(s) == 1:
        return "." if w in FUNCTION else "/"
    return "".join("/" if c in "12" else "x" for c in s)

def last_word(line):
    ws = re.findall(r"[A-Za-z']+", line)
    return ws[-1].lower().strip("'") if ws else ""

def rhyme_part(w):
    ph = pronouncing.phones_for_word(w)
    return pronouncing.rhyming_part(ph[0]) if ph else None

def scan(path, target):
    lines = open(path, encoding="utf-8").read().splitlines()
    out, prev = [], None
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(("#", "(", "**", "---", "|", ">", "[")):
            prev = None if not line else prev
            continue
        words = re.findall(r"[A-Za-z']+", line)
        shape = "".join(word_shape(w) for w in words)
        n = len(shape)
        strong = shape.count("/")
        flag = "" if abs(n - target) <= 1 else ("  <-- LONG" if n > target else "  <-- SHORT")
        rhyme = ""
        lw = last_word(line)
        if prev is not None:
            a, b = rhyme_part(prev), rhyme_part(lw)
            rhyme = "  rhymes" if a and b and a == b else f"  (no exact rhyme: {prev}/{lw})"
            prev = None
        else:
            prev = lw
        out.append(f"{n:>3} syl {strong:>2} str  {shape:<22} {line}{flag}{rhyme}")
    print("\n".join(out))

if __name__ == "__main__":
    t = 14
    if "--target" in sys.argv:
        t = int(sys.argv[sys.argv.index("--target") + 1])
    scan(sys.argv[1], t)
