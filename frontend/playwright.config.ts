import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./tests',timeout:45000,workers:1,use:{baseURL:'http://127.0.0.1:5173',viewport:{width:390,height:844},launchOptions:{executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'},screenshot:'only-on-failure'},reporter:'list'})
