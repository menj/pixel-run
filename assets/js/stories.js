/* ============================================================
   PIXEL RUN — character stories
   ------------------------------------------------------------
   Plain data, no logic, so the text can be edited (or translated)
   without touching the game. Keyed by character id (dino, cat,
   penguin, robot). Each chapter unlocks once the player's best
   score reaches its `at` value; a character's first chapter
   unlocks together with the character (see CHARACTERS in game.js).
   ============================================================ */
(function () {
  'use strict';

  window.PixelRunStories = {
    dino: {
      title: 'The Road That Never Ends',
      teaser: 'Eeny hatched on a road with no beginning.',
      chapters: [
        { at: 0,   title: 'Hatching Day',
          text: 'Eeny hatched in the middle of a dusty road with no start and no end. The cacti kept coming, so he kept jumping. He is not the fastest dino, only the most stubborn.' },
        { at: 100, title: 'Pink Presents',
          text: 'Somebody has been leaving gift boxes along the road. The pink ones go BOOM. The blue ones hum like a soft shield. Eeny does not know who is so generous, but he is very grateful.' },
        { at: 300, title: 'The Long Night',
          text: 'The sun went out and the stars came on. Far ahead, three small lights bobbed along the road, one orange, one black and white, one steady blue. Eeny ran faster.' },
        { at: 600, title: 'Four at Dawn',
          text: 'At sunrise Eeny caught up with Meeny, Miny and Moe. Together they found the start of the road: a sign that read, "Eeny, meeny, miny, moe, pick a runner, off you go." They laughed, and ran again.' },
      ],
    },

    cat: {
      title: 'The Red Dot',
      teaser: 'Meeny is chasing something bright.',
      chapters: [
        { at: 0,   title: 'A Bright Little Dot',
          text: 'Meeny saw a glowing dot cross the sky and her tail went straight up. It was far too high to pounce on, but she is a cat, and she has never once let that stop her.' },
        { at: 100, title: 'Nine Jumps',
          text: 'She counts every leap. The tall cacti taught her something: jumping higher is easier than jumping harder, and a cat who lands on her feet can always try again.' },
        { at: 300, title: 'The Second Dot',
          text: 'The dot sank below the horizon, and a pale silver one rose behind it. Meeny blinked slowly. Same game, new light. She trotted on, delighted.' },
        { at: 600, title: 'Seven Lives Left',
          text: 'She met a large green dino who was running the very same way. Meeny stopped chasing the dot that evening. She realised the best part had been the running, and the company.' },
      ],
    },

    penguin: {
      title: 'Wrong Turn at the Iceberg',
      teaser: 'Miny is very far from home.',
      chapters: [
        { at: 300, title: 'Wrong Turn',
          text: 'Miny turned left at the last iceberg instead of right. Now there is sand under her feet and a very hot sun above them. She waddled on with great dignity, because that is all a penguin can do.' },
        { at: 450, title: 'Almost Flying',
          text: 'When the wind blows just right and she holds her flippers out, her feet leave the sand. Not flying, exactly. Gliding. The pterodactyls laughed. Miny practised anyway.' },
        { at: 600, title: 'The Cold Star',
          text: 'At night Miny found the coldest star in the sky and decided it must be pointing home. She followed it across the desert, gliding over every cactus she could.' },
        { at: 900, title: 'Home Is a Direction',
          text: 'She never found the iceberg. She found three friends, and a road that felt like home anyway. Some days, Miny decided, home is simply the way you are running together.' },
      ],
    },

    robot: {
      title: 'Boot Sequence',
      teaser: 'Moe woke up with a charged shield and no memories.',
      chapters: [
        { at: 600, title: 'Boot Sequence',
          text: 'Moe switched on in the middle of the desert with a fully charged shield and a single word on the visor: RUN. Moe did not know why. Moe did not need to. Moe ran.' },
        { at: 750, title: 'Low Battery',
          text: 'Moe runs on sunlight, and the nights are long. By midnight the shield was a faint hum. Moe learned to move carefully, and that resting is also a kind of running.' },
        { at: 900, title: 'The Visor',
          text: 'Moe found scratches inside the visor, a message in its own handwriting: "You have done this before. The desert resets. Do not stop." Moe understood. The road had been waiting for a long time.' },
        { at: 1200, title: 'Remember',
          text: 'With three friends beside it, Moe made a decision: this time, remember. Moe saved four names in the first memory slot: Eeny, Meeny, Miny and Moe. Then the sun rose, and the reset never came.' },
      ],
    },
  };
})();
