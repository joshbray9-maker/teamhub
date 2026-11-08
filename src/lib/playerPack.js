// The basketball Player info page (Josh, 2026-11-08): the BCS Basketball S&C Player Pack, typed
// in as data so players have the need-to-know on their phone. Wording is the pack's own; change it
// here, not in the page. Each tab has sections; each section is a list of blocks:
//   { kind: 'cards', items: [{ tag, title, text }] }       numbered principle cards
//   { kind: 'list', title, sub, items: [text] }            bullet box
//   { kind: 'table', title, sub, cols, rows, note }        rows are arrays of cells; a { group } row is a heading
//   { kind: 'plan', title, sub, rows: [[label, [lines]]] } a fuelling plan
//   { kind: 'text', text, strong }                         a paragraph

const COOL_DOWN = (pigeon) => ({
  kind: 'table', title: 'Cool-down', sub: '3–5 mins', cols: ['Stretch', 'Dose'],
  rows: [
    ['Legs on wall – legs together', '30 sec'],
    ['Toes up → toes down', '30 sec each'],
    ['Right ankle over left ankle: push knee to wall, pull ankle to chest', '30 sec each'],
    ['Butterfly', 'x2:00'],
    ['Off wall: half-kneeling t-spine rotations', 'x12/side'],
    [pigeon, 'x1:00–2:00/side'],
  ],
  note: 'This is a program-standard cool-down that should be done together within 5 mins of the game ending. Individual needs will be added as needed. Try incorporating at least 2 reps of box breathing together; add in your own reps while doing the rest of the stretches.',
});
const RECOVERY = {
  kind: 'table', title: 'Inter shift · set · period · quarter · half: recovery', cols: ['Drill', 'Notes'],
  rows: [['Box breathing: 3 s in, 3 s hold, 3 s out, 3 s hold', 'Progress time by a second or 2 as you become more accustomed to it. Add a few reps every once in a while.']],
};
const ACTIVATION = ['Lateral walks, fwd/bwd walks, glute bridge, walkouts: 6–10/side of each movement'];

const SCHOOL_DAY = [
  ['Breakfast', ['2–3 eggs', '1 package cooked oats + fruit or 2 slices whole wheat + PB + fruit', '2 cups water']],
  ['Snack 1', ['1–2 servings fruit + water']],
  ['Lunch', ['1 cup rice / quinoa / potatoes', '1.5–2 servings meat', '2–3 servings veggies', '1 serving fruit', '2 cups water']],
  ['Pre-practice snack', ['Nutrigrain bar / granola bar', 'Karbolyn / carb mix / fruit juice / fruit', 'Same after practice before lift (i.a.)']],
];
const POST_GAME = [
  ['Post-game snack', ['Shake 1 scoop + 1 serving fruit']],
  ['Post-game meal', ['1–2 servings meat', '2–3 servings carb source', '1–2 cups water']],
];
const GAME_AM = [
  ['Breakfast (2–3 hrs before game)', ['Greek yogurt + granola', '1 serving fruit', '1–2 cups water']],
  ['1.5–1 hr pre-game', ['1–2 servings fruit']],
  ['30 mins → game', ['Sip on Gatorade or high-carb drink']],
  ['Half / periods / quarters', ['Sip on 3:1 carb & water mix']],
  ...POST_GAME,
];
const GAME_PM = [
  ['Breakfast', ['2–3 eggs', '1 package cooked oats + fruit or 2 slices whole wheat + PB + fruit', '2 cups water']],
  ['Snack 1', ['1 serving fruit + water']],
  ['Lunch', ['Sandwich (turkey/ham/chicken/substitute)', '1–2 cups water']],
  ['2–3 hrs pre-game', ['Greek yogurt + granola', '1–2 servings fruit', '1–2 cups water']],
  ['30 mins → game', ['Sip on Gatorade or high-carb drink']],
  ['Half / periods / quarters', ['Sip on carb & water mix']],
  ...POST_GAME,
];
const MACROS = (cal, carb, pro, fat) => ({
  kind: 'table', title: 'Nutrition breakdown', sub: `Basic example · ${cal} cal/day`,
  cols: ['Macro', 'Cal/g', '% of cal', `e.g. ${cal} cal/day`, 'Supplements'],
  rows: [
    ['Carbohydrate', '4 cal/g', '45–60%', carb, 'Karbolyn / complex sugar-based sport drink'],
    ['Protein', '4 cal/g', '20–35%', pro, 'Whey isolate / casein'],
    ['Fats', '9 cal/g', '10–20%', fat, 'Omega 3 & 6'],
    ['Micro', '–', '–', '–', 'Vitamin A, B, C, D, E = multivitamin; B6 & B12; magnesium & calcium'],
  ],
  note: '# of intakes: 3 meals + 2–3 snacks · pre & post training shake/supp · micros throughout day + supps',
});

export const PACK = {
  title: 'Basketball Strength & Conditioning',
  intro: 'Principles, protocols, nutrition and conditioning guidelines for the BCS Bears basketball program.',
  tabs: [
    {
      id: 'warmups', label: 'Warm-ups', sections: [
        {
          id: 'practice', label: 'Practice', title: 'Practice warm-up', sub: 'Pre-afternoon practice (2 sessions) · 3:30 – 6:00 PM', blocks: [
            { kind: 'list', title: '3:20 PM arrival', items: ['1 glass of water + 2 pieces of fruit from DH', 'Water bottle filled with water or supplement', 'Have shake prepared for post lift', 'Have snack ready for pre and/or post lift'] },
            { kind: 'list', title: 'Activation before team warm-up', items: [...ACTIVATION, 'Wall sit x45 sec (adding 5 sec weekly)', 'Knee wall touches, squats, t-spine rotations', 'Jump rope x3:00'] },
            {
              kind: 'table', title: 'Team activation', sub: 'Engage main musculature + energy systems involved in sport', cols: ['Exercise', 'Dose', 'Coaching cues'], rows: [
                ['Partner-resisted lateral banded crossovers', '2 × 10 m/side', 'Get low and maintain depth. Push off, regather, recover. Glutes should be on fire! Partner is there to resist, not prevent.'],
                ['Straight, bent arm, and push/pull ISO', 'x15 sec/movement/arm', "Don't fight, just push to engage the muscles… but make it hard on each other."],
                ['ERD drop lunge', 'x12/leg', 'ERD = Every rep different.'],
                ['3-position SL hamstring ISO (short–med–long)', '20 s/position/leg', 'Start close like a glute bridge and hold, then move leg to next position, hold, long position, hold… switch legs.'],
                ['Banded pull-aparts', 'x20–30', 'Use enough tension to get a good burn in the chest and shoulders. Alternative: tempo push-ups 1–2 × 5 w/ 5 sec lowering.'],
                ['Banded shoulder press', 'x20–30', "Same deal as pull-aparts… add curls if you'd like. Alternative: inchworm walkouts x8–12."],
                ['Upright rows', 'x20–30', 'Elbows to ceiling, band close to body.'],
              ],
            },
          ],
        },
        {
          id: 'pregame', label: 'Pre-game', title: 'Pre-game warm-up', blocks: [
            { kind: 'list', title: 'Pre-game nutrition', items: ['3 hours pre: main meal', '1.5 hours pre: small carb snack (fruit w/ water)', '45 mins before: simple sugar… a few gummy bears', 'Water bottle w/ electrolytes for game'] },
            { kind: 'list', title: '50 mins beforehand', sub: 'Duration: 5 mins', items: ['A. Banded circuit: fwd/bwd/S2S', 'B. Hamstring walkout x6 + 5 s/rep', 'C. Jump rope 2–3:00', 'D. Individuals x2:00–3:00'] },
            {
              kind: 'table', title: 'Stations', sub: 'Groups of 3–4 (2 mins/station) · Duration: 6 mins', cols: ['Station', 'Content'], rows: [
                ['Station 1', 'Waterbag split stance rotations OR BBall rotations x6/side · Waterbag/BBall SL decels x8/side · Waterbag / BW split stance oscillations x20 sec/side'],
                ['Station 2', 'Close-out drill. Rim to 3-pt line. x2–3/person'],
                ['Station 3', 'Knee tag / shoulder tag / wrist grab knee tag'],
              ],
            },
            {
              kind: 'table', title: 'Potentiation', sub: 'As a team · Duration: 5–7 mins', cols: ['Exercise', 'Dose', 'Coaching cues'], rows: [
                ['5–5 m ball gather', 'x3–4/person', 'Drop ball once player has touched line.'],
                ['Partner chase down', 'x2/partner', 'Leading partner holds hand out; once the hand is released, both are activated.'],
                ['3-pt sprint: sprint & side shuffle', 'x1/side/movement', 'As a team!'],
              ],
            },
            COOL_DOWN('Pigeon stretch'),
            RECOVERY,
          ],
        },
        {
          id: 'morning', label: 'Morning practice', title: 'Morning practice warm-up', blocks: [
            { kind: 'list', title: '6:35 AM arrival', items: ['1 glass of water upon waking up', '1 piece of fruit as you walk to practice', 'Sip on a water bottle with some electrolytes or carbs', 'Protein shake as you prepare for the day'] },
            { kind: 'list', title: 'Activation', items: [...ACTIVATION, 'Jump rope x3:00'] },
            {
              kind: 'table', title: 'Additional mobility', sub: 'Increase mobility and prevent locomotive restriction', cols: ['Exercise', 'Dose', 'Progression'], rows: [
                ['Deep squat to extension', 'x10', 'Add 1 set every 2 weeks'],
                ["World's greatest stretch w/ rotation", 'x8–10/side', 'Add 1 set every 2 weeks'],
                ['Split stance BBall rotations', 'x10/side', 'Add 1 set every 2 weeks'],
              ],
            },
            {
              kind: 'table', title: 'Something to get you fired up', sub: 'Potentiation: final touch, priming the body for game/practice', cols: ['Exercise', 'Dose', 'Progression'], rows: [
                ['Partner/wall lateral push', '2 × 10 sec/side', 'Perform against wall if no partner'],
                ['2-2-10 m COD', 'x3/side', 'Add a rep every 2 weeks'],
                ['3-pt sprint', 'x2/side', 'Add 1 rep every 2 weeks'],
              ],
            },
            COOL_DOWN('Elevated pigeon stretch'),
            RECOVERY,
          ],
        },
      ],
    },
    {
      id: 'rules', label: 'Rules & expectations', sections: [
        {
          id: 'gym', label: 'Gym rules', title: 'Gym rules & expectations', sub: 'The standards we hold in the weight room', blocks: [
            {
              kind: 'list', numbered: true, items: [
                'No alterations to training sessions will be made without talking to the head of S&C.',
                'No other programs will be used in place of, or in conjunction with, our designated program unless otherwise advised by the head of S&C or Sports Med.',
                'You follow the designated team warm-up protocol. It will start early enough to allow you time for your personal routines, rituals, and superstitions.',
                'Attend all program training sessions, unless provided a suitable excuse.',
                'Arrive on time (5 mins early).',
                'Bring your personal program to training sessions.',
                'Complete all extras/assigned individuals on your own time.',
                'You must check in, face to face, with the S&C coach if leaving (for a test, appointment, bathroom, to see the AT, meet with another coach, etc.) or missing a session due to any one of these reasons.',
                'Respect the S&C coach and interns while giving instructions, coaching, and/or working with other teammates.',
                'Respect the space we work out in (rearrange weights, pick up after yourself, music at a respectable level, ensure the space is tidy before departing: lights off, windows closed, weights away).',
                'No food in the weight room (water or a bottle with supplements is fine).',
                'Closed-toe shoes must be worn at all times, unless otherwise specified.',
                'Routine misbehaviour will result in being removed from the gym and further consequences as set out by the coaching staff.',
                'Show up and give your best effort, respect those around you, and ask questions!',
              ],
            },
          ],
        },
        {
          id: 'principles', label: 'Guiding principles', title: 'Guiding principles', sub: 'Mission, vision and ambition', blocks: [
            {
              kind: 'cards', items: [
                { tag: '01', title: 'Our mission', text: 'Maximize our potential through the commitment to long-term development and to elevate our game through necessary means and methods so that we can excel through diversity.' },
                { tag: '02', title: 'Our vision', text: 'To uphold an incomparable status of performance amongst all competitive pathways within our sport. To develop through consistent engagement, education, and evaluation.' },
                { tag: '03', title: 'Our ambition', text: 'To become the program that others chase to become. To provide development unparalleled to our competition and prepare for subsequent levels, no matter the stage.' },
              ],
            },
          ],
        },
        {
          id: 'environment', label: 'Training environment', title: 'Training environment', sub: 'Environment, engagement and effort', blocks: [
            {
              kind: 'cards', items: [
                { tag: 'E1', title: 'Environment', text: 'Who we are is defined by our commitment to one another. We build trust and cohesion through a strong sporting and team environment. How we treat each other matters; be a good person.' },
                { tag: 'E2', title: 'Engagement', text: "We respect each other's time by being present, attentive, and respectful. Engage in sessions, conversations, and teachings with intent." },
                { tag: 'E3', title: 'Effort', text: 'Your effort is expected to be high, not perfect. Put your best foot forward daily, regardless if it is your 100% or 10%. We show up for each other; coaches, players, staff.' },
              ],
            },
          ],
        },
        {
          id: 'philosophy', label: 'Philosophy', title: 'Philosophical foundations', sub: 'Programming philosophy and training hierarchy', blocks: [
            { kind: 'text', text: 'My programming philosophy is pragmatic in nature. A response-driven approach that is centered on meeting the demands of the sport, the needs of the athlete, and to match the standards of the team.' },
            {
              kind: 'cards', items: [
                { title: 'My philosophy', text: 'Training is an accessory to sport, intended to help improve the sport-specific capacities associated with playing at high speed, long durations, and physical resiliency, so athletes can move faster, physically dominate opposition, and mitigate injury.' },
                { title: 'Sport first', text: "Above all, sport remains the #1 priority. S&C is used as a means to ensure athletes play their sport without obstruction. I'm not here to build better gym lifters, I'm here to build better athletes. Sport performance is the ultimate test of how well we enact our philosophies." },
              ],
            },
            {
              kind: 'table', title: 'Training hierarchy', sub: 'Top of the pyramid first', cols: ['Level', 'What builds it'], rows: [
                ['Sport', 'Practice + learn your sport'],
                ['Capacity to endure', 'Conditioning + mental resilience'],
                ['Capacity to compete', 'Strength, speed, + power'],
                ['Capacity to play', 'Athletic skill development: coordination, SAQ & COD'],
                ['Tolerance to fatigue', 'Nutrition, hydration, and sleep'],
              ],
            },
          ],
        },
        {
          id: 'sessions', label: 'Session framework', title: 'Session framework', sub: 'Every session is placed by its distance from game-day and by where it sits on the volume–intensity spectrum.', blocks: [
            {
              kind: 'cards', items: [
                { tag: 'Furthest from game-day', title: 'Brick', meta: 'High volume', bullets: ['High load and/or repetition', '60:40 weaknesses:strengths', 'High eccentric demand*', '1–2 sessions/week'] },
                { tag: 'Game-day −2/3', title: 'Engine', meta: 'High volume · high intensity', bullets: ['Energy system development', 'Aerobic power (MAS)', 'Anaerobic threshold'] },
                { tag: 'Game-day −1', title: 'Supercharge', meta: 'High intensity', bullets: ['Speed and power day', 'System prep', 'Movement velocity centered', 'Acceleration and/or max velocity*', '75% strengths, 25% weaknesses'] },
                { tag: 'Game-day +1', title: 'Recharge', meta: 'Low volume · low intensity', bullets: ['Full body flow + tissue prep', 'In and out mentality', 'Mobility + light loading', 'Blood flow, minimum effective dose work, and prepare for new week'] },
              ],
            },
            { kind: 'text', text: '*Session proximity to game-day & intensity dependent on season phase, sport, and schedule.', small: true },
          ],
        },
      ],
    },
    {
      id: 'nutrition', label: 'Nutrition', sections: [
        {
          id: 'plans', label: 'Daily plans', title: 'Daily fuelling plans', blocks: [
            { kind: 'plan', title: 'School day + practice', sub: 'Plan 1', rows: SCHOOL_DAY },
            { kind: 'plan', title: 'Game-day (AM)', sub: 'Plan 2', rows: GAME_AM },
            { kind: 'plan', title: 'Game-day (PM)', sub: 'Plan 3', rows: GAME_PM },
          ],
        },
        {
          id: 'macros', label: 'Macros', title: 'Nutrition breakdown', blocks: [MACROS('2,500', '275–325 g/day', '120–180 g/day', '30–60 g/day'), MACROS('2,000', '225–300 g', '100–150 g', '22–50 g')],
        },
        {
          id: 'cheat', label: 'Cheat sheet', title: 'Nutrition cheat sheet', blocks: [
            {
              kind: 'table', cols: ['Form', 'AKA', 'Forms', 'Performance function'], rows: [
                { group: 'Carbohydrate' },
                ['Simple', 'Monosaccharide', 'Glucose, fructose, and galactose', 'Quick energy availability: ideal for explosive events / between bouts'],
                ['Complex', 'Disaccharide', 'Sucrose, lactose, and maltose', 'Delayed release: ideal 3–48 hours before events'],
                { group: 'Protein' },
                ['Complete', 'EAAs', 'Animal products, soy, quinoa', 'Includes all necessary components for muscle repair and building'],
                ['Incomplete', 'Lack EAAs', 'Seeds, nuts, plant sources', 'Best for athletes with protein intake limitations'],
                ['Quick', '–', 'Whey isolate', 'Best consumed pre/post training… quick uptake'],
                ['Slow', '–', 'Casein protein', 'Slow-release protein best taken post workout/night, prolonged protein synthesis'],
                { group: 'Fats' },
                ['Monounsaturated', 'Healthy fats', 'Olives, olive oil, avocados, nuts, and nut oils', 'Helps lower LDL cholesterol'],
                ['Polyunsaturated', 'Ess. fatty acids', 'Fish, walnuts, flaxseeds, chia seeds, and plant-based oils', 'Lowers LDL & decreases risk of heart disease, improved nervous system function'],
                ['Saturated', 'Room temp = solid', 'Red meat, dairy products (butter, whole milk, cheese), palm oil, and coconut oil', 'Increase LDL… found in most whole sources of meat'],
                ['Trans fat', 'Bad fats', 'Artificially produced foods', 'High in HDL… should be avoided in large consumption. Accompanied with intake of processed quick-uptake carbs. Give and take dependent on situation'],
                { group: 'Micro' },
                ['Water soluble', 'Need to be replenished often', 'The B-complex vitamins (thiamine, riboflavin, niacin, etc.) and vitamin C', 'Essential for energy production, nerve function, red blood cell formation, and collagen synthesis'],
                ['Fat soluble', 'Stored in fatty tissue', 'Vitamins A, D, E, and K', 'Crucial for vision, bone health, immune function, and protecting against oxidative damage'],
                ['Macrominerals', '', 'Calcium, phosphorus, magnesium, sodium, chloride, potassium, and sulfur', 'Aids in recovery, sleep, bone growth, and water retention'],
                ['Trace minerals', '', 'Iron, zinc, iodine, copper, selenium, manganese, and fluoride', 'Oxygen transport, immune system health, thyroid function, and enzyme activity'],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'extras', label: 'Extras', sections: [
        {
          id: 'discomfort', label: 'Discomfort', title: 'Extras', sub: 'Targeted add-ons for common areas of discomfort.', blocks: [
            {
              kind: 'table', title: 'Knee discomfort', cols: ['Exercise', 'Dose', 'Coaching cues'], rows: [
                ['Roll feet, calves, quads, hamstrings', 'x30 sec/body part', 'Warm up the tissue before mobilizing'],
                ['Spanish squat extensions', '2 × 10/leg', 'Forward, backwards, and both sides: knee must track over toe'],
                ['Wall sit (high → middle → low)', 'x20 sec/position', 'Sink right into each position… add in toe/heel rocks'],
                ['Banded abductions', '1–2 × 15/side', 'Band around ankles (abduct = away from body)'],
                ['Banded squat', '1–2 × 20', 'Band around knees… full depth!'],
              ],
            },
            {
              kind: 'table', title: 'Hip discomfort', cols: ['Exercise', 'Dose', 'Coaching cues'], rows: [
                ['Roll glutes, hamstrings, and quads', 'x30 sec/body part', 'Warm up the tissue before mobilizing'],
                ['Banded abduction + adduction', '2 × 10/leg', 'Hold for a sec at end of each rep'],
                ['Standing banded hip flexion', '1–2 × 12/leg', "1 sec pause at top of each rep… use hand support to ensure you're focusing tension on the bent leg"],
                ['Loaded elevated pigeon', '1–2 × 6/side', 'Pause at bottom and really hold the deep ranges'],
              ],
            },
            {
              kind: 'table', title: 'Foot / ankle / calf discomfort', cols: ['Exercise', 'Dose', 'Coaching cues'], rows: [
                ['Banded external rotations', '1–2 × 15', 'Band around toes, push feet out'],
                ['Tippy toe walk', '2 × 10 m', 'Or heel toe walk'],
                ['SL calf ISO (flat or deficit)', '2–3 × 20 sec/side', 'Knee over toe, high heel, pressure from toes to calf!'],
                ['Inversion + eversion walks', '2 × 10 m', 'Forward & backwards'],
              ],
            },
            {
              kind: 'table', title: 'Shoulder discomfort', cols: ['Exercise', 'Dose', 'Coaching cues'], rows: [
                ['Bent-over SA rotations', '2 × 10 sec/direction/arm', 'Passive, let the weights move you.'],
                ['Y-raise ISO or W-raise ISO', '2–3 × 10 sec', 'Partner pushes down or use door frame'],
                ['IYT raise (chest supported using bench)', '2 × 6', 'Each rep = I + Y + T: light load'],
                ['Lu-raises', '1–2 × 10', '5 lb plate'],
                ['Hanging scap raise or push-up scap presses', '1–2 × 10–15', 'Focus on moving just your shoulder blades'],
                ['Deep lat stretch with rotations', '1 × 45 s/side', '…wards and outwards… think about sitting back and relaxing'],
                ['Seated internal rotations', '1–2 × 5/side', 'Use a 5 lb DB'],
              ],
            },
          ],
        },
        {
          id: 'conditioning', label: 'Conditioning', title: 'Conditioning extras', sub: 'Although you will receive more than enough conditioning between practice, games, and trainings, here are some options you can add in if you feel the necessity.', blocks: [
            {
              kind: 'table', title: 'BCS Strength & Conditioning', sub: 'General guidelines', cols: ['Exercise(s)', 'Sets', 'Reps', 'Intensity', 'Work : rest'], rows: [
                { group: 'Improve breakaway speed & gapping opposition', sub: 'PCR: max-effort short sprints' },
                ['Sprints: 10 sec or less', '3–6 sets', '2–4 reps', 'Max effort', '3–5:1'],
                { group: 'Improve first half of a shift: initial energy', sub: 'PCR-glycolytic: moderate-length sprints' },
                ['Max-effort shuttles: 10–30 sec', '3–6 sets', '3–5 reps', 'Max effort', '2–6:1'],
                { group: 'Improve how long they can sustain high efforts', sub: 'Fast glycolysis: threshold shuttles' },
                ['Multi-length shuttles: 30 sec–2 mins', '1–3 sets', '2–4 reps', 'High effort', '4–10:1'],
                { group: 'Improve overall capacity (short)', sub: 'Glyc. oxidative: time pyramids' },
                ['Time pyramids: 1–3 min on/off', '1–3 sets', '1–4 reps', 'Moderate', '1:1'],
                { group: 'Improve ability to recover between shifts (long)', sub: 'Oxidative: continuous / long work:rest' },
                ['Norwegian method: 4 min on : 3 min off', '1–3 sets', '1–3 reps', 'Low–moderate', '1:1'],
              ],
              note: 'Can be done on any of these: bike, rower, treadmill, ice, grass, etc.',
            },
            { kind: 'text', text: 'As always, consult me ahead of time to ensure you are doing what is best for you.', strong: true },
          ],
        },
      ],
    },
  ],
};
