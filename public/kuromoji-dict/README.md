# Kuromoji dictionary (Japanese readings)

The Japanese reading provider (`ja-furigana`) needs kuromoji's morphological
dictionary: twelve gzipped `.dat.gz` files, about 17 MB in total. Because that is
far larger than the rest of the extension, it is **not** committed to git and
not part of the default build.

Enable it with:

```sh
npm run dict:ja   # copies node_modules/@patdx/kuromoji/dict/*.dat.gz here
wxt build
```

After installing the dictionary, reload the extension. Without it the Japanese
provider reports `provider-unavailable` and the popup simply shows no reading
for Japanese text — nothing else breaks.

The dictionary is Apache-2.0 licensed (see `THIRD_PARTY_NOTICES.md`).
