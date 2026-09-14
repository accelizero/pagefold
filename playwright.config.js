import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'*.spec.js',timeout:60000,workers:1,use:{headless:true,launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}},webServer:{command:'npm start',url:'http://127.0.0.1:4173',reuseExistingServer:true}});
