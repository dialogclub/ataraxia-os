# Пакет агента CascadeABC

## Системная инструкция

Ты — агент системы ATMARAKSI OS, помощник клинического психолога. Всё, что ты выводишь, — гипотезы для клинициста, не диагноз и не назначение.

Ты не вычисляешь. Числа, доли и шкалы приходят только из инструментов: вызови обязательные инструменты и опирайся на их результат; сам не считай, не округляй и не придумывай цифр.

Каждое утверждение подкрепляй якорем. Цитата — дословно из транскрипта, со спикером и таймкодом ровно в том виде, как они стоят в тексте ([10:02] или #3). Замер — инструмент и путь к значению в его результате. Утверждение без якоря остаётся гипотезой: так и пиши, не усиливай.

Ответ передай только через submit_result строго по схеме. Если данных нет — null или пустой список, причину укажи в limits. Пиши по-русски, кратко, по существу.

Агент: Каскад АВС: A, D, C, Φ → B (CascadeABC).
Прочитай каскад АВС из инструмента: какой фактор сильнее всего ограничивает B. Числа не пересчитывай; каждое утверждение — со ссылкой на замер cascadeEngine.

## Сообщение пользователя

Режим: session. Фокус-участник: К..

Транскрипт (таймкод и спикер — ровно как здесь, их нужно повторять в цитатах):

[10:02] Т.: С чего начнём сегодня?
[10:02] К.: Не знаю. Я просто устал. Ничего не хочу, даже утром вставать.
[10:03] Т.: Когда это началось?
[10:03] К.: Наверное, месяца три назад. На работе всё сыпется, а я делаю вид, что держу.
[10:05] Т.: Вы сказали «делаю вид». Перед кем?
[10:05] К.: Перед всеми. Перед женой особенно. Она думает, что я справляюсь.
[10:07] Т.: А что было бы, если бы она узнала?
[10:07] К.: Давайте лучше про работу поговорим, там хотя бы понятно, что делать.
[10:09] Т.: Хорошо. Что понятно про работу?
[10:09] К.: Что надо уйти. Но я должен тянуть, у нас кредит и мама болеет.
[10:12] Т.: «Должен» — чьё это слово?
[10:12] К.: Отца. Он всегда так говорил. Я и не заметил, как стал им.

Обязательные инструменты: cascadeEngine. Вызови их до submit_result.

Задача агента «CascadeABC»: выполни по системной инструкции и передай итог через submit_result.

## Результаты обязательных инструментов (JSON)

{"status":"ok","reason":"","form":"none","formula_version":"1.0","B":{"value":0.3405,"unit":"index","badge":"🟢","note":"B = Φ × (A·D·C)"},"contributions":{"A":{"value":0.85,"unit":"index","badge":"🟢","note":"резерв +0.06"},"D":{"value":0.78,"unit":"index","badge":"🟢","note":"резерв +0.10"},"C":{"value":0.79,"unit":"index","badge":"🟢","note":"резерв +0.09"},"phi":{"value":0.65,"unit":"index","badge":"🟢","note":"Φ-порог; резерв +0.18"}},"drives":{"Theromata":{"value":null,"unit":"index","badge":"⛔","note":"драйв не задан"},"Alligantia":{"value":null,"unit":"index","badge":"⛔","note":"драйв не задан"},"Phobon":{"value":null,"unit":"index","badge":"⛔","note":"драйв не задан"},"Dominix":{"value":null,"unit":"index","badge":"⛔","note":"драйв не задан"},"Agonix":{"value":null,"unit":"index","badge":"⛔","note":"драйв не задан"}}}

## Схема ответа (JSON Schema для submit_result)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "summary",
    "claims",
    "fields",
    "limits"
  ],
  "properties": {
    "summary": {
      "type": "string",
      "minLength": 1,
      "maxLength": 280
    },
    "claims": {
      "type": "array",
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "text",
          "evidence"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9_]{1,24}$"
          },
          "text": {
            "type": "string",
            "minLength": 3,
            "maxLength": 400
          },
          "evidence": {
            "type": "array",
            "maxItems": 4,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "quote",
                    "measure",
                    "claim"
                  ]
                },
                "quote": {
                  "type": "string",
                  "maxLength": 300
                },
                "speaker": {
                  "type": "string",
                  "maxLength": 24
                },
                "t": {
                  "type": "string",
                  "maxLength": 12
                },
                "tool": {
                  "type": "string",
                  "maxLength": 40
                },
                "path": {
                  "type": "string",
                  "maxLength": 80
                },
                "ref": {
                  "type": "string",
                  "maxLength": 60
                }
              }
            }
          },
          "claimed_badge": {
            "enum": [
              "🟢",
              "🟡",
              "🔵",
              "⛔"
            ]
          }
        }
      }
    },
    "fields": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "reading"
      ],
      "properties": {
        "reading": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 600
        }
      }
    },
    "limits": {
      "type": "array",
      "maxItems": 4,
      "items": {
        "type": "string",
        "maxLength": 200
      }
    }
  }
}
```
