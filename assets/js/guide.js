/* ============================================================
   PIXEL RUN — player guide
   ------------------------------------------------------------
   Plain data, no logic, so the text can be edited (or translated)
   without touching the game. Rendered by game.js into the GUIDE
   panel, one tab per entry below. {copper}, {bronze}, {silver},
   {gold} and {platinum} are replaced with the live medal scores
   (MEDALS in game.js), so the guide cannot drift from the game.
   The RUNNERS tab also lists the characters straight from
   CHARACTERS in game.js.
   ============================================================ */
(function () {
  'use strict';

  window.PixelRunGuide = [
    {
      id: 'goal', label: 'GOAL', icon: '🎯',
      sections: [
        { h: 'Run as far as you can', p: 'Your score climbs the longer you survive, about 10 points a second, plus bonus points for destroying obstacles. Beat your best (HI) and climb the leaderboard.' },
        { h: 'Obstacles', p: 'Cacti stand on the ground: jump them. Birds fly in once you are moving fast: duck under them, or jump over the low ones. Touching one costs a heart.' },
        { h: 'Three lives', p: 'Classic and daily runs start with three hearts, shown beside the pause button. Hit an obstacle and you lose a heart, the obstacle is smashed and you blink for a moment while you recover. Lose all three and the run ends. Hearts come back for each new run.' },
        { h: 'It keeps getting faster', p: 'Every obstacle you clear speeds the road up a little, until it hits a top speed. There are no separate levels: the road is the level, and speed is the difficulty.' },
        { h: 'What you are playing for', p: 'Your best score unlocks runners and story chapters, and every run can earn a medal on the game-over screen. Gifts along the way can save a run or make it very silly.' },
      ],
    },
    {
      id: 'controls', label: 'CONTROLS', icon: '🎮',
      sections: [
        { h: 'Jump', p: 'SPACE or ↑, or tap the screen / the JUMP button. Hold for a higher jump. The penguin glides if you keep holding in the air.' },
        { h: 'Duck', p: 'Hold ↓, or hold the DUCK button, to slide under birds.' },
        { h: 'Pause', p: 'P, or the ⏸ button on the game. Resuming gives a 3-2-1 first. The game also pauses by itself if you switch tabs.' },
        { h: 'Restart and sound', p: 'R restarts the run at any time. M mutes and unmutes.' },
      ],
    },
    {
      id: 'gifts', label: 'GIFTS', icon: '🎁',
      sections: [
        { h: '💣 PINK bomb', p: 'Destroys every obstacle on screen.' },
        { h: '🛡️ BLUE shield', p: 'About 9 seconds of smashing through whatever you touch.' },
        { h: '⏳ GREEN slow-mo', p: 'About 6 seconds with the road at roughly half speed. You still move normally.' },
        { h: '🎁 GOLD surprise', p: 'One random surprise each time, never the same twice in a row:' },
        { list: [
          ['Wither', 'cacti shrivel and die as they come on screen'],
          ['Bird boom', 'birds explode'],
          ['Lightning', 'super speed, invulnerable, with a burning trail that sets cacti on fire'],
          ['Cactus party', 'cacti stand up, grow faces and dance, and ignore you'],
          ['Moon jump', 'low gravity for big, floaty jumps'],
          ['Giant mode', 'you grow huge and stomp cacti flat'],
          ['Hamilton Taxi', 'Hamilton the bird carries you over everything'],
          ['Sneeze', 'a long wind-up, then every obstacle ahead is blown away'],
          ['Jackpot', '+75 points'],
        ] },
        { h: 'Points for destroying things', p: 'Every obstacle you destroy, by any gift, scores +10 for a cactus or +15 for a bird, with a floating number.' },
      ],
    },
    {
      id: 'medals', label: 'MEDALS', icon: '🏅',
      sections: [
        { h: 'Score goals', p: 'The game-over screen awards a medal for the run\'s score:' },
        { list: [
          ['Copper', '{copper}'],
          ['Bronze', '{bronze}'],
          ['Silver', '{silver}'],
          ['Gold', '{gold}'],
          ['Platinum', '{platinum}'],
        ] },
        { h: 'Good to know', p: 'Medals are kept on your device only. Nothing about them is sent to the server. Admin and cheat runs are not recorded.' },
      ],
    },
    {
      id: 'modes', label: 'MODES', icon: '🧭',
      sections: [
        { h: 'Classic', p: 'The normal game. Pick any unlocked runner, with their special trait, and chase your own best score.' },
        { h: 'Daily challenge', p: 'Press DAILY. Everyone gets the same course today, and runners have no special traits so it is fair. You get a separate best score for each day.' },
        { h: 'Online and offline', p: 'ONLINE lets you submit your score to the leaderboard when you finish a run. OFFLINE keeps everything on this device. The button next to the leaderboard switches between them when a server is available.' },
        { h: 'Story', p: 'Each runner has a short story. Chapters unlock as your best score grows. Press STORY to read them.' },
      ],
    },
    {
      id: 'runners', label: 'RUNNERS', icon: '🦖',
      sections: [
        { h: 'Pick your runner', p: 'Choose a runner above the game. The locked ones open when your best score reaches their mark.' },
      ],
    },
  ];
})();
