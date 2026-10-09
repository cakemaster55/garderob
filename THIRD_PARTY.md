# Сторонние компоненты

| Компонент | Файлы | Лицензия |
| --- | --- | --- |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 1.18.0 | `vendor/ort/*` | MIT |
| [U²-Net (u2netp)](https://github.com/xuebinqin/U-2-Net), файл из релизов [rembg](https://github.com/danielgatis/rembg) | `models/u2netp.onnx` | Apache-2.0 |
| [IS-Net / DIS](https://github.com/xuebinqin/DIS) (general use), файл из релизов rembg, переведён в float16 | `models/isnet-fp16.onnx.part*` | Apache-2.0 |
| MobileNetV3-Large, веса из [timm](https://github.com/huggingface/pytorch-image-models), с дообученной головой | `models/clothes.onnx` | Apache-2.0 |
| [clothing-dataset-small](https://github.com/alexeygrigorev/clothing-dataset-small) — данные для обучения головы (в репозиторий не входят) | — | CC0 |
| [Sofia Sans Condensed](https://github.com/lettersoup/Sofia-Sans) через Fontsource | `fonts/*` | SIL OFL 1.1 |
