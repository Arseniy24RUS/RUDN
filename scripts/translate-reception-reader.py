"""Translate pinned Reception strings with a local, version-pinned M2M100 model.

The JSONL cache supports interrupted runs and is input to the reader asset builder.
See the reader builder for source, coverage and structure checks.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import time

MODEL = 'facebook/m2m100_418M'
REVISION = '55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636'
LANGUAGES = ('en', 'zh')
CYRILLIC = re.compile(r'[а-яё]', re.IGNORECASE)
SENTENCE_BOUNDARY = re.compile(r'(?<=[.!?;])\s+')
FRAGMENT_WORDS = 125
FRAGMENT_CHARACTERS = 570

def fragment(text, length=FRAGMENT_CHARACTERS):
    if len(text) <= length and len(text.split()) <= FRAGMENT_WORDS:
        return [text]
    result, pending = [], ''
    for sentence in SENTENCE_BOUNDARY.split(text):
        candidate = f'{pending} {sentence}'.lstrip()
        if len(candidate) <= length and len(candidate.split()) <= FRAGMENT_WORDS:
            pending = candidate
            continue
        if pending:
            result.append(pending)
        words = sentence.split()
        pending = ''
        for word in words:
            candidate = f'{pending} {word}'.lstrip()
            if len(candidate) > length or len(candidate.split()) > FRAGMENT_WORDS:
                if pending:
                    result.append(pending)
                pending = word
            else:
                pending = candidate
    if pending:
        result.append(pending)
    return result

def claim_key(source):
    return hashlib.sha256(source.encode('utf-8')).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Pinned Russian input produced by the reader asset builder')
    parser.add_argument('output', type=Path, help='Append-only, resumable JSONL cache')
    parser.add_argument('--device', default='cuda', choices=['cpu','cuda'])
    parser.add_argument('--batch', default=64, type=int)
    parser.add_argument('--beam-size', default=3, choices=[1,2,3,4], type=int)
    parser.add_argument('--no-repeat-ngram-size', default=5, type=int)
    parser.add_argument('--fragment-characters', default=FRAGMENT_CHARACTERS, type=int)
    parser.add_argument('--benchmark', type=int, default=0, help='Translate a bounded sample without saving')
    args = parser.parse_args()

    import torch
    os.add_dll_directory(str(Path(torch.__file__).parent / 'lib')) if os.name == 'nt' else None
    import ctranslate2
    from huggingface_hub import snapshot_download
    from transformers import M2M100Tokenizer
    model = Path(snapshot_download(MODEL, revision=REVISION, allow_patterns=[
        '*.json', 'pytorch_model.bin', 'sentencepiece.bpe.model',
    ]))
    converted = args.output.parent / ('m2m100-418m-' + REVISION[:12])
    if not (converted / 'model.bin').exists():
        from ctranslate2.converters import TransformersConverter
        TransformersConverter(str(model)).convert(str(converted), quantization='float16', force=True)
    engine = ctranslate2.Translator(str(converted), device=args.device,
                                   compute_type='float16' if args.device == 'cuda' else 'float32')
    tokenizer = M2M100Tokenizer.from_pretrained(model, src_lang='ru')
    requests = json.loads(args.input.read_text(encoding='utf-8'))
    if requests.get('model') != MODEL + '@' + REVISION:
        raise ValueError('Unexpected translation model pin')
    translations = {}
    if args.output.exists() and not args.benchmark:
        with args.output.open(encoding='utf-8') as existing:
            for line in existing:
                item = json.loads(line)
                translations[item['key']] = item
    work = [frag for source in requests['texts'] if CYRILLIC.search(source) for frag in fragment(source,args.fragment_characters)]
    portions = sorted({part for part in work if claim_key(part) not in translations}, key=lambda text: (len(text), text))
    if args.benchmark:
        middle = len(portions) // 2
        portions = portions[middle:middle + args.benchmark]
    print(f'{len(portions)} untranslated segments, {len(translations)} cached', flush=True)
    started = time.monotonic()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('a', encoding='utf-8') if not args.benchmark else open(os.devnull, 'w', encoding='utf-8') as out:
        for offset in range(0, len(portions), args.batch):
            texts = portions[offset:offset + args.batch]
            tokens = [tokenizer.convert_ids_to_tokens(ids) for ids in tokenizer(texts)['input_ids']]
            answers = {}
            for locale in LANGUAGES:
                prefix = tokenizer.lang_code_to_token[locale]
                translated = engine.translate_batch(tokens, target_prefix=[[prefix]] * len(tokens),
                    beam_size=args.beam_size, min_decoding_length=3, no_repeat_ngram_size=args.no_repeat_ngram_size, max_input_length=0,
                    max_decoding_length=max(96,max(map(len,tokens))*3))
                outputs = []
                for index, result in enumerate(translated):
                    hypothesis = result.hypotheses[0]
                    ids = tokenizer.convert_tokens_to_ids(hypothesis[1:] if hypothesis[0] == prefix else hypothesis)
                    value = tokenizer.decode(ids, skip_special_tokens=True).strip()
                    if not value:
                        value = texts[index]
                    outputs.append(value)
                answers[locale] = outputs
            for index, part in enumerate(texts):
                item = {'key':claim_key(part), **{locale: answers[locale][index] for locale in LANGUAGES}}
                print(json.dumps(item, ensure_ascii=False), file=out)
                translations[item['key']] = item
            out.flush()
            if not offset % (args.batch*20) or args.benchmark:
                print(f'{offset+len(texts)}/{len(portions)} segments in {time.monotonic()-started:.1f}s', flush=True)
            if args.benchmark:
                for index, value in enumerate(texts[:4]):
                    print(value, answers['en'][index], answers['zh'][index], sep='\n')
    if not args.benchmark:
        result = requests.copy()
        result['translations'] = {
            claim_key(text): {locale:' '.join(translations[claim_key(part)][locale] for part in fragment(text,args.fragment_characters))
                for locale in LANGUAGES}
            for text in requests['texts'] if CYRILLIC.search(text)
        }
        del result['texts']
        args.output.with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False), encoding='utf-8')

if __name__ == '__main__':
    main()
