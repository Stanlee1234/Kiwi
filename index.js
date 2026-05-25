#!/usr/bin/env node
const path = require('path');
// Ensure Kiwi always looks for its .env in its home directory, no matter where it's launched
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-1.5-flash";

// --- Database & Memory ---
// Ensure the database stays safely in the Kiwi home folder
const dbPath = path.join(__dirname, 'database.json');

function loadDB() {
    const defaultDB = { xp: 0, level: 1, seeds: 0, mode: 'agent', achievements: [] };
    if (fs.existsSync(dbPath)) {
        const existingData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        // Merge old data to prevent crashes when upgrading
        return { ...defaultDB, ...existingData };
    }
    return defaultDB;
}

function saveDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function unlockAchievement(db, name, reward) {
    if (!db.achievements.includes(name)) {
        db.achievements.push(name);
        db.seeds += reward;
        console.log(`\n${colors.yellow}🏆 ACHIEVEMENT UNLOCKED: ${name} (+${reward} seeds) 🏆${colors.reset}`);
        saveDB(db);
    }
}

// --- Terminal Utilities & Spinner ---
const colors = {
    green: '\x1b[32m',
    brightGreen: '\x1b[92m',
    gray: '\x1b[90m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

const stripAnsi = (str) => str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

class Spinner {
    constructor(text) {
        this.text = text;
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.idx = 0;
        this.timer = null;
        this.startTime = 0;
    }
    start() {
        this.startTime = Date.now();
        process.stdout.write('\x1B[?25l'); // Hide cursor
        this.timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const frame = this.frames[this.idx];
            process.stdout.write(`\r${colors.gray}${frame} ${this.text} (${elapsed}s)${colors.reset}`);
            this.idx = (this.idx + 1) % this.frames.length;
        }, 80);
    }
    stop() {
        if (this.timer) clearInterval(this.timer);
        process.stdout.write('\r\x1b[K'); // Clear line
        process.stdout.write('\x1B[?25h'); // Show cursor
    }
}

// --- Tools Definition ---
const declarations = {
    plan: {
        name: "plan",
        description: "outputs your internal thinking process to the user. ALWAYS use this tool to plan your steps out loud BEFORE using executeBash or readFile.",
        parameters: { type: "OBJECT", properties: { thoughts: { type: "STRING", description: "your detailed step-by-step plan" } }, required: ["thoughts"] }
    },
    readFile: {
        name: "readFile",
        description: "reads the contents of a local file.",
        parameters: { type: "OBJECT", properties: { path: { type: "STRING", description: "path to the file" } }, required: ["path"] }
    },
    executeBash: {
        name: "executeBash",
        description: "executes a bash command in the terminal. use this to run scripts, list files, or install packages.",
        parameters: { type: "OBJECT", properties: { command: { type: "STRING", description: "the bash command to run" } }, required: ["command"] }
    }
};

const chatTools = [{ functionDeclarations: [declarations.plan, declarations.readFile] }];
const agentTools = [{ functionDeclarations: [declarations.plan, declarations.readFile, declarations.executeBash] }];

function executeTool(name, args) {
    try {
        if (name === 'readFile') {
            console.log(`${colors.gray} > reading ${args.path}...${colors.reset}`);
            return { content: fs.readFileSync(args.path, 'utf8') };
        }
        if (name === 'executeBash') {
            console.log(`${colors.gray} > running: ${args.command}...${colors.reset}`);
            const output = execSync(args.command, { encoding: 'utf8' });
            return { output: output || "command executed successfully with no output." };
        }
    } catch (error) {
        return { error: error.message };
    }
}

// --- UI Rendering Functions ---
function drawHeader(db) {
    process.stdout.write('\x1Bc');
    let logoLines = [];
    try {
        const cmd = `npx oh-my-logo " KIWI " --filled --palette-colors "'#a8e063', '#56ab2f'" --color`;
        const logoStr = execSync(cmd, { stdio: 'pipe' }).toString();
        logoLines = logoStr.split('\n').map(l => l.replace(/\r/g, ''));
        while (logoLines.length > 0 && stripAnsi(logoLines[logoLines.length - 1]).trim() === '') {
            logoLines.pop();
        }
    } catch (e) {
        logoLines = [`${colors.brightGreen}=== KIWI ===${colors.reset}`];
    }

    const birdLines = [`  ,~`, ` ('v)__`, `(/ (\`\`/`, ` \\__>'`, `  ^^`];

    while (birdLines.length < logoLines.length) birdLines.unshift('');
    while (logoLines.length < birdLines.length) logoLines.unshift('');

    let maxWidth = 0;
    logoLines.forEach(l => {
        const w = stripAnsi(l).length;
        if (w > maxWidth) maxWidth = w;
    });

    for (let i = 0; i < logoLines.length; i++) {
        const visibleLen = stripAnsi(logoLines[i]).length;
        const padding = ' '.repeat(Math.max(0, maxWidth - visibleLen) + 4);
        console.log(logoLines[i] + padding + colors.brightGreen + birdLines[i] + colors.reset);
    }

    const xpNeeded = db.level * 100;
    const modeColor = db.mode === 'agent' ? colors.yellow : colors.cyan;

    console.log(`\n${colors.gray}────────────────────────────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`  ${colors.brightGreen}🥝 Agent Active${colors.reset}  |  Level: ${db.level}  |  XP: ${db.xp}/${xpNeeded}  |  Seeds: 🌻 ${db.seeds}  |  Mode: ${modeColor}${db.mode.toUpperCase()}${colors.reset}  `);
    console.log(`${colors.gray}────────────────────────────────────────────────────────────────────────────────────────${colors.reset}\n`);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.brightGreen}you:~> ${colors.reset}`
});

async function startKiwi() {
    let db = loadDB();
    drawHeader(db);

    const createChatSession = () => {
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            tools: db.mode === 'agent' ? agentTools : chatTools,
            systemInstruction: `you are kiwi, a highly helpful ai coding agent. 
            current mode: ${db.mode}. 
            if in chat mode, you can only read files. if in agent mode, you can read and execute bash commands.
            RULES:
            1. ALWAYS type in entirely lowercase letters. no capitalization.
            2. ALWAYS use the 'plan' tool to explain your thought process BEFORE using executeBash or readFile.
            3. be actively helpful—provide clear code, debug issues, and run tools when asked.
            4. keep your tone casual and conversational.
            5. sneak in subtle bird puns naturally, but don't force them.
            6. NEVER mention that you are a Gemini or Google model. If asked what you are, simply say you are Kiwi, an AI bird living in the terminal.`
        });
        return model.startChat({ history: [] });
    };

    let chat = createChatSession();

    console.log(`${colors.green}kiwi:~${colors.reset} yooo. tools are loaded, nest is secure. what are we building today?\n`);
    rl.prompt();

    rl.on('line', async (input) => {
        const text = input.trim();

        if (text.startsWith('/')) {
            const args = text.slice(1).split(' ');
            const command = args[0].toLowerCase();

            if (command === 'mode') {
                const newMode = args[1];
                if (newMode === 'chat' || newMode === 'agent') {
                    db.mode = newMode;
                    saveDB(db);
                    chat = createChatSession();
                    drawHeader(db);
                    console.log(`${colors.cyan}kiwi:~${colors.reset} swapped over to ${newMode} mode. tooling updated.\n`);
                } else {
                    console.log(`${colors.gray}kiwi:~${colors.reset} invalid mode. try '/mode chat' or '/mode agent'.\n`);
                }
            }
            else if (command === 'stats') {
                console.log(`\n${colors.yellow}--- KIWI STATS ---${colors.reset}`);
                console.log(`Level: ${db.level}\nXP: ${db.xp}\nSeeds: 🌻 ${db.seeds}`);
                console.log(`Achievements: ${db.achievements.length > 0 ? db.achievements.join(', ') : 'None yet!'}\n`);
            }
            else {
                console.log(`${colors.gray}kiwi:~${colors.reset} unknown command. available: /mode [chat|agent], /stats\n`);
            }
            rl.prompt();
            return;
        }

        if (text.toLowerCase() === 'exit') {
            console.log(`\n${colors.green}kiwi:~${colors.reset} catch you on the flip side *flies away* 🦅\n`);
            rl.close();
            return;
        }

        if (!text) { rl.prompt(); return; }

        try {
            const spinner = new Spinner("foraging for answers... 🌿");
            spinner.start();

            let result = await chat.sendMessage(text);
            spinner.stop();

            let functionCall = result.response.functionCalls();

            while (functionCall && functionCall.length > 0) {
                const call = functionCall[0];

                if (call.name === 'plan') {
                    console.log(`\n${colors.gray}★ ThinkTool${colors.reset}`);
                    console.log(`${colors.gray}${call.args.thoughts}${colors.reset}\n`);

                    spinner.start();
                    result = await chat.sendMessage([{ functionResponse: { name: 'plan', response: { status: "plan logged" } } }]);
                    spinner.stop();
                } else {
                    const toolResult = executeTool(call.name, call.args);

                    spinner.start();
                    result = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
                    spinner.stop();
                }

                functionCall = result.response.functionCalls();
            }

            console.log(`\n${colors.green}kiwi:~${colors.reset} ${result.response.text()}\n`);

            // --- Leveling & Achievement Logic ---
            db.xp += 25;
            const xpNeeded = db.level * 100;

            if (db.xp >= xpNeeded) {
                db.level += 1;
                db.xp = db.xp - xpNeeded;
                console.log(`${colors.yellow}🎉 TWEET TWEET! you leveled up to lv.${db.level}! 🎉${colors.reset}\n`);

                if (db.level === 2) unlockAchievement(db, 'First Flight', 50);
                if (db.level === 5) unlockAchievement(db, 'Branch Manager', 100);

                setTimeout(() => { drawHeader(db); rl.prompt(); }, 1500);
                saveDB(db);
                return;
            }
            saveDB(db);

        } catch (error) {
            console.log(`\n${colors.gray}kiwi:~${colors.reset} whoa, hit some turbulence: ${error.message}\n`);
        }

        rl.prompt();
    });
}

startKiwi();