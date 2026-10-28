const { chromium } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const prisma = new PrismaClient();
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const user = await prisma.user.findFirst({where:{role:'SUPER_ADMIN',isActive:true}}) || await prisma.user.findFirst({where:{role:'ORGANIZER',isActive:true}});
 if(!user) throw Error('Diperlukan akun pengelola lokal untuk uji browser');
 const context = await browser.newContext();
 await context.addCookies([{name:'token',value:jwt.sign({userId:user.id,role:user.role},process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://localhost:3100',httpOnly:true}]);
 const page = await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync('/tmp/padel-browser',{recursive:true});
 for(const width of [390,768,1440]) {
  await page.setViewportSize({width,height:900});
  for(const route of ['/','/admin','/admin/tournaments','/admin/players','/admin/social','/admin/profile','/admin/organization']) {
   await page.goto('http://localhost:3100'+route);await page.waitForLoadState('networkidle');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   const heading=await page.locator('h1').first().textContent().catch(()=>null);
   console.log(JSON.stringify({width,route,overflow,heading}));
   await page.screenshot({path:`/tmp/padel-browser/${width}-${route.replaceAll('/','_')||'home'}.png`,fullPage:true});
   if(overflow) errors.push(`Overflow ${width} ${route}`);
  }
 }
 console.log('ERRORS',JSON.stringify(errors));
 await browser.close();await prisma.$disconnect();
 if(errors.length) process.exitCode=1;
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1)});
