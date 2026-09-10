import argparse


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cancerlike")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="run the API server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")

    args = parser.parse_args(argv)

    if args.command == "serve":
        import uvicorn

        uvicorn.run(
            "cancerlike.server:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
        )
        return 0

    parser.print_help()
    return 0
