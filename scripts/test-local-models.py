#!/usr/bin/env python3
"""Run one locally downloaded Phase 2 V2 checkpoint at a time, without network access."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "data" / "models"
SAMPLE = "Example Bank: Your account was debited INR 450.00 at Example Cafe."


def test_onnx(name: str) -> None:
    import onnxruntime as ort
    from tokenizers import Tokenizer

    directory = ROOT / name
    start = time.perf_counter()
    tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
    session = ort.InferenceSession(
        str(directory / "model.onnx"), providers=["CPUExecutionProvider"]
    )
    load_seconds = time.perf_counter() - start
    encoded = tokenizer.encode(SAMPLE)
    feeds = {}
    for item in session.get_inputs():
        if item.name == "input_ids":
            values = encoded.ids
        elif item.name == "attention_mask":
            values = encoded.attention_mask
        elif item.name == "token_type_ids":
            values = encoded.type_ids
        else:
            raise RuntimeError(f"Unsupported ONNX input {item.name!r}")
        feeds[item.name] = np.asarray([values], dtype=np.int64)

    start = time.perf_counter()
    outputs = session.run(None, feeds)
    inference_seconds = time.perf_counter() - start
    if not all(np.isfinite(output).all() for output in outputs):
        raise RuntimeError("Model produced a non-finite tensor")

    print(json.dumps({
        "selected": name,
        "result": "PASS: local ONNX inference",
        "tokens": len(encoded.ids),
        "output_shapes": [list(output.shape) for output in outputs],
        "load_seconds": round(load_seconds, 3),
        "inference_seconds": round(inference_seconds, 3),
        "note": "Base checkpoint forward pass only; no expense-task classification head is trained.",
    }, indent=2))


def test_smollm2() -> None:
    from llama_cpp import Llama, LlamaGrammar

    schema = {
        "type": "object",
        "properties": {
            "amount": {"type": ["number", "null"]},
            "currency": {"enum": ["INR", "USD", "EUR", None]},
            "transactionType": {"enum": ["debit", "credit", None]},
            "merchant": {"type": ["string", "null"], "maxLength": 32},
            "category": {"enum": [
                "Food & Dining", "Shopping", "Travel", "Bills & Utilities",
                "Entertainment", "Other", None,
            ]},
        },
        "required": ["amount", "currency", "transactionType", "merchant", "category"],
        "additionalProperties": False,
    }
    grammar = LlamaGrammar.from_json_schema(json.dumps(schema))
    start = time.perf_counter()
    model = Llama(
        model_path=str(ROOT / "smollm2" / "model.gguf"),
        n_ctx=1024,
        n_threads=4,
        verbose=False,
        chat_format="chatml",
    )
    load_seconds = time.perf_counter() - start
    start = time.perf_counter()
    result = model.create_chat_completion(
        messages=[
            {"role": "system", "content": "Extract explicit transaction facts. Use null when absent."},
            {"role": "user", "content": SAMPLE},
        ],
        max_tokens=160,
        temperature=0,
        grammar=grammar,
    )
    inference_seconds = time.perf_counter() - start
    text = result["choices"][0]["message"]["content"]
    parsed = json.loads(text)
    print(json.dumps({
        "selected": "smollm2",
        "result": "PASS: local GGUF generation and JSON constraint",
        "proposal": parsed,
        "load_seconds": round(load_seconds, 3),
        "inference_seconds": round(inference_seconds, 3),
        "completion_tokens": result.get("usage", {}).get("completion_tokens"),
        "note": "Base checkpoint output is experimental and is not quality-approved for expense parsing.",
    }, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        required=True,
        choices=("minilm", "mobilebert", "smollm2"),
        help="Select exactly one installed model to load and test.",
    )
    selected = parser.parse_args().model
    if selected == "smollm2":
        test_smollm2()
    else:
        test_onnx(selected)


if __name__ == "__main__":
    main()
