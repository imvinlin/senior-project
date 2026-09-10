import argparse


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cancerlike")
    parser.add_subparsers(dest="command")
    parser.parse_args(argv)
    return 0
