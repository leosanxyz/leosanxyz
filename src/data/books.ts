export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  amazonUrl?: string;
  goodreadsUrl?: string;
  quotes: string[];
}

export const books: Book[] = [
  {
    id: 'the-creative-act',
    title: 'The Creative Act',
    author: 'Rick Rubin',
    cover: '/books/theCreativeAct.jpg',
    quotes: [
      "Creativity is not a rare ability. It is not difficult to access. Creativity is a fundamental aspect of being human. It's our birthright. And it's for all of us.",
      "The act of creation is an attempt to enter a mysterious realm. A longing to transcend. What we create allows us to share glimpses of an inner landscape, one that is beyond our understanding. Art is our portal to the unseen world.",
      "Art is choosing to do something skillfully, caring about the details, bringing all of yourself to make the finest work you can. It is beyond ego, vanity, self-glorification, and need for approval.",
      "The object isn't to make art, it's to be in that wonderful state which makes art inevitable.",
      "To live as an artist is a way of being in the world. A way of perceiving. A practice of paying attention.",
      "Art creates a profound connection between the artist and the audience. Through that connection, both can heal.",
    ],
  },
  {
    id: 'make-something-wonderful',
    title: 'Make Something Wonderful',
    author: 'Steve Jobs',
    cover: '/books/makeSomethingWonderful.jpg',
    quotes: [
      "There's lots of ways to be, as a person. And some people express their deep appreciation in different ways. But one of the ways that I believe people express their appreciation to the rest of humanity is to make something wonderful and put it out there.",
      "Be a creative person. Creativity equals connecting previously unrelated experiences and insights that others don't see. You have to have them to connect them.",
      "Life is short; don't waste it. Tell the truth. Technology should enhance human creativity. Process matters. Beauty matters. Details matter. The world we know is a human creation—and we can push it forward.",
      "Everything that makes up what we call life was made by people no smarter, no more capable, than we are; that our world is not fixed—and so we can change it for the better.",
      "Steve later called computers 'a bicycle of the mind.'",
    ],
  },
  {
    id: 'the-art-of-loving',
    title: 'The Art of Loving',
    author: 'Erich Fromm',
    cover: '/books/theArtofLoving.jpg',
    quotes: [
      "Love is an active power in man; a power which breaks through the walls which separate man from his fellow men, which unites him with others; love makes him overcome the sense of isolation and separateness, yet it permits him to be himself, to retain his integrity.",
      "The deepest need of man, then, is the need to overcome his separateness, to leave the prison of his aloneness.",
      "Love is the only way of knowledge, which in the act of union answers my quest. In the act of loving, of giving myself, in the act of penetrating the other person, I find myself, I discover myself, I discover us both, I discover man.",
      "In spite of the deep-seated craving for love, almost everything else is considered to be more important than love: success, prestige, money, power—almost all our energy is used for the learning of how to achieve these aims, and almost none to learn the art of loving.",
      "Without love, humanity could not exist for a day.",
    ],
  },
  {
    id: 'cartas-a-un-joven-poeta',
    title: 'Cartas a un Joven Poeta',
    author: 'Rainer Maria Rilke',
    cover: '/books/cartasAUnJovenPoeta.jpg',
    quotes: [
      "Una obra de arte es buena si ha nacido al impulso de una íntima necesidad.",
      "Las obras de arte viven en medio de una soledad infinita, y a nada son menos accesibles como a la crítica. Sólo el amor alcanza a comprenderlas y hacerlas suyas.",
      "Ser artista es: no calcular, no contar, sino madurar como el árbol que no apremia su savia, mas permanece tranquilo y confiado bajo las tormentas de la primavera.",
      "Describa sus tristezas y sus anhelos, sus pensamientos fugaces y su fe en algo bello; y dígalo todo con íntima, callada y humilde sinceridad.",
      "También es bueno amar, pues el amor es cosa difícil. El amor de un ser humano hacia otro: esto es quizás lo más difícil que nos haya sido encomendado.",
    ],
  },
  {
    id: 'el-camino-de-los-reyes',
    title: 'El Camino De Los Reyes',
    author: 'Brandon Sanderson',
    cover: '/books/elCaminoDeLosReyes.jpg',
    quotes: [
      "Actúa con honor, y el honor te ayudará.",
      "A veces el premio no merece la pena el coste. Los medios por los que conseguimos la victoria son tan importantes como la victoria misma.",
      "Vida antes que muerte. Fuerza antes que debilidad. Viaje antes que destino.",
      "La autoridad no viene del rango. ¿De dónde viene? De los hombres que te la dan. Es la única forma de conseguirla.",
      "Seguimos los Códigos no porque traigan riquezas, sino porque repudiamos aquello en lo que entonces nos convertiríamos si hiciéramos lo contrario.",
    ],
  },
  {
    id: 'walden',
    title: 'Walden',
    author: 'Henry David Thoreau',
    cover: '/books/walden.jpeg',
    quotes: [
      "Cada mañana era una alegre invitación a lograr que mi vida tuviera la misma sencillez e inocencia que la naturaleza.",
      "El arte del genio consistía en hacer mucho con poco.",
      "Mi vida ha sido el poema que habría escrito, pero no podía vivirlo y pronunciarlo.",
      "Si tuviera que vender mis mañanas y mis tardes a la sociedad, como hace la mayoría, estoy seguro de que no me quedaría nada por lo que vivir.",
      "El arte de escribir era, en efecto, el arte más cercano a la vida.",
    ],
  },
];

export function getBookById(id: string): Book | undefined {
  return books.find((book) => book.id === id);
}

export function getBookByTitle(title: string): Book | undefined {
  return books.find(
    (book) => book.title.toLowerCase() === title.toLowerCase()
  );
}
