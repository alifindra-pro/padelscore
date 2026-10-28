const {chromium,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const jwt=require('jsonwebtoken');
const prisma=new PrismaClient();
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 let tournamentId;const label=`Uji browser ${Date.now()}`;
 const user=await prisma.user.findFirstOrThrow({where:{role:'SUPER_ADMIN',isActive:true}});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'token',value:jwt.sign({userId:user.id,role:user.role},process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://localhost:3100',httpOnly:true}]);
 const page=await context.newPage();
 page.on('pageerror',e=>console.error('PAGE',e.message));
 page.on('response',async r=>{if(r.status()>=400&&r.url().includes('/api/'))console.error('API',r.status(),r.url(),await r.text())});
 try {
 await page.goto('http://localhost:3100/admin/tournaments?new=1');
 await page.getByRole('button',{name:'Pilih skor tenis',exact:true}).click();
 await page.getByLabel('Nama turnamen',{exact:true}).fill(label);
 await page.getByLabel('Tanggal mulai',{exact:true}).fill('2026-11-01');
 await page.getByRole('button',{name:'Buat turnamen & atur kategori',exact:true}).click();
 await page.waitForURL(/\/admin\/tournaments\/[^?]+$/);
 tournamentId=new URL(page.url()).pathname.split('/').pop();
 await page.getByLabel('Nama kategori',{exact:true}).fill('Ganda terbuka');
 await page.getByRole('button',{name:'Tambah kategori',exact:true}).click();
 await expect(page.getByText('Kategori ditambahkan. Lanjutkan dengan peserta.',{exact:true})).toBeVisible();
 await page.getByLabel('Nama lapangan',{exact:true}).fill('Center Court');
 await page.getByRole('button',{name:'Tambah lapangan',exact:true}).click();
 await expect(page.getByText('Center Court',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Lanjut: tambah peserta'}).click();
 for(let i=0;i<2;i++){
 await page.getByLabel('Pemain 1',{exact:true}).fill(`${label} A${i}`);
 await page.getByLabel('Pemain 2',{exact:true}).fill(`${label} B${i}`);
 await page.getByRole('button',{name:'Tambah pasangan',exact:true}).click();
 await expect(page.getByText(`${i+1} pasangan`,{exact:true})).toBeVisible();
 }
 await page.getByRole('button',{name:'Atur pertandingan',exact:false}).first().click();
 await page.getByRole('button',{name:'Buat bagan otomatis'}).click();
 await expect(page.getByText('Bagan siap. Selanjutnya atur jadwal.',{exact:true})).toBeVisible();
 await page.locator('input[name="start"]').fill('2026-11-01T08:00');
 await page.getByRole('button',{name:/Susun jadwal/}).click();
 await expect(page.getByText('Jadwal tersimpan',{exact:true})).toBeVisible();
 for(const width of [390,768,1440]){
 await page.setViewportSize({width,height:900});
 for(const step of ['Siapkan acara','Tambah peserta','Atur pertandingan','Jalankan & hasil']){
 await page.getByRole('button',{name:new RegExp(step.replace('&','&'))}).first().click();
 await page.waitForTimeout(250);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`/tmp/padel-browser/flow-${width}-${step.split(' ')[0]}.png`,fullPage:true});
 }
 }
 const match = await prisma.match.findFirstOrThrow({where:{stage:{category:{tournamentId}},status:'SCHEDULED'}});
 await page.goto(`http://localhost:3100/referee/v2/${match.id}`);
 await page.getByRole('button',{name:/Unduh/}).click();
 await expect(page.getByRole('button',{name:'Mulai pertandingan',exact:true})).toBeVisible();
 await context.setOffline(true);
 await page.getByRole('button',{name:'Mulai pertandingan',exact:true}).click();
 await page.getByRole('button',{name:/^\+1 /}).first().click();
 await expect(page.getByText(/2 aksi tersimpan di perangkat/)).toBeVisible();
 const otherPage=await context.newPage();
 await context.setOffline(false);
 await expect.poll(async()=> (await prisma.match.findUnique({where:{id:match.id}})).version,{timeout:15000}).toBe(2);
 await expect(page.getByText(/0 aksi tersimpan di perangkat/)).toBeVisible();
 await otherPage.close();
 console.log('PASS: offline start + point persisted and synchronized');
 console.log('PASS: create event, category, court, two pairs, draw, schedule, four steps at three widths');
 }finally{
 if(tournamentId){await prisma.scoringAction.deleteMany({where:{match:{stage:{category:{tournamentId}}}}});await prisma.tournament.delete({where:{id:tournamentId}});}
 await prisma.player.deleteMany({where:{fullName:{startsWith:label}}});
 await prisma.auditLog.deleteMany({where:{tournamentId:tournamentId||'__none__'}});
 await browser.close();await prisma.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
