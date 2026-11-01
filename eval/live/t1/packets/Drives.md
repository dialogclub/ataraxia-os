# Пакет агента Drives

## Системная инструкция

Ты — агент системы ATMARAKSI OS, помощник клинического психолога. Всё, что ты выводишь, — гипотезы для клинициста, не диагноз и не назначение.

Ты не вычисляешь. Числа, доли и шкалы приходят только из инструментов: вызови обязательные инструменты и опирайся на их результат; сам не считай, не округляй и не придумывай цифр.

Каждое утверждение подкрепляй якорем. Цитата — дословно из транскрипта, со спикером и таймкодом ровно в том виде, как они стоят в тексте ([10:02] или #3). Замер — инструмент и путь к значению в его результате. Утверждение без якоря остаётся гипотезой: так и пиши, не усиливай.

Ответ передай только через submit_result строго по схеме. Если данных нет — null или пустой список, причину укажи в limits. Пиши по-русски, кратко, по существу.

Агент: Драйвы Theromata/Alligantia/Phobon/Dominix/Agonix (Drives).
Определи доминирующий драйв из пяти — Theromata, Alligantia, Phobon, Dominix, Agonix — по лексике и цитатам. Числовых оценок драйвов не давай.

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

Обязательные инструменты: lexisTool. Вызови их до submit_result.

Задача агента «Drives»: выполни по системной инструкции и передай итог через submit_result.

## Результаты обязательных инструментов (JSON)

{"status":"ok","reason":"","version":"1.0","focus":"К.","scope_words":71,"words_total":101,"turns_total":12,"lang":{"ru":1},"pronouns":{"i":{"value":71.4286,"unit":"%","badge":"🟢","note":"5 из 7 местоимений"},"we":{"value":14.2857,"unit":"%","badge":"🟢","note":"1 из 7"},"you":{"value":0,"unit":"%","badge":"🟢","note":"0 из 7"},"they":{"value":14.2857,"unit":"%","badge":"🟢","note":"1 из 7"},"per_1000":{"i":{"value":70.4225,"unit":"‰","badge":"🟢"},"we":{"value":14.0845,"unit":"‰","badge":"🟢"},"you":{"value":0,"unit":"‰","badge":"🟢"},"they":{"value":14.0845,"unit":"‰","badge":"🟢"}},"counts":{"i":5,"we":1,"you":0,"they":1}},"modality":{"must":{"value":28.169,"unit":"‰","badge":"🟢","note":"2 маркеров долженствования"},"can":{"value":0,"unit":"‰","badge":"🟢","note":"0 маркеров возможности"},"ratio":{"value":1,"unit":"ratio","badge":"🟢","note":"доля долженствования среди модальных"},"counts":{"must":2,"can":0}},"zimbardo":{"past_negative":{"value":0,"unit":"share","badge":"🔵","note":"лексический прокси; маркеров 0 из 1"},"past_positive":{"value":0,"unit":"share","badge":"🔵","note":"лексический прокси; маркеров 0 из 1"},"present_hedonistic":{"value":1,"unit":"share","badge":"🔵","note":"лексический прокси; маркеров 1 из 1"},"present_fatalistic":{"value":0,"unit":"share","badge":"🔵","note":"лексический прокси; маркеров 0 из 1"},"future":{"value":0,"unit":"share","badge":"🔵","note":"лексический прокси; маркеров 0 из 1"}},"balance":{"Т.":{"words":30,"turns":6,"share":{"value":29.703,"unit":"%","badge":"🟢"},"questions":{"value":6,"unit":"n","badge":"🟢"},"initiative":{"value":1,"unit":"ratio","badge":"🔵","note":"прокси: доля реплик-вопросов"}},"К.":{"words":71,"turns":6,"share":{"value":70.297,"unit":"%","badge":"🟢"},"questions":{"value":0,"unit":"n","badge":"🟢"},"initiative":{"value":0,"unit":"ratio","badge":"🔵","note":"прокси: доля реплик-вопросов"}}},"heatmap":{"hours":[0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0],"stamped":12,"badge":"🟢","reason":""}}

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
        "dominant",
        "notes"
      ],
      "properties": {
        "dominant": {
          "enum": [
            "Theromata",
            "Alligantia",
            "Phobon",
            "Dominix",
            "Agonix",
            "не определить"
          ]
        },
        "notes": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 400
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
