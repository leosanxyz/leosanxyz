# Sonidos de las preguntas

Archivos proporcionados por Leo el 21 de septiembre de 2026 para las respuestas del canvas. Son copias sin recortes ni cambios de formato. La solicitud no incluye información de licencia.

| Archivo | Original | Uso |
| --- | --- | --- |
| `correct.mp3` | `correct.mp3` | Respuesta correcta confirmada por el servidor |
| `1gift-confetti.mp3` | `1gift-confetti.mp3` | Junto con los otros sonidos de acierto |
| `confetti-pop-sound.mp3` | `confetti-pop-sound.mp3` | Junto con los otros sonidos de acierto |
| `incorrect.mp3` | `leapster-wrong-answer-sound.mp3` | Respuesta incorrecta confirmada por el servidor |

`client/questions/useQuestionSounds.ts` controla la reproducción. El acierto reproduce `correct.mp3`, `1gift-confetti.mp3` y `confetti-pop-sound.mp3` simultáneamente, con el mismo instante de inicio. La ganancia del acierto es 0,65 y la del error 0,21. Estos valores acercan su sonoridad integrada a −21,5 LUFS; los picos y la duración siguen siendo propios de cada efecto. Un resultado nuevo detiene los sonidos del resultado anterior. El navegador debe permitir audio y la pestaña debe estar visible.
