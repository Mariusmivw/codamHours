import express from "express"
import path from "path"
import session from 'express-session'
import { v4 as uuid } from 'uuid'
import { passport, UserProfile } from './authentication'
import { env } from "./env"
import { DataBase } from './db/database'
import { authUrl, saveToken, setGmailSuccess } from "./db/getMails"
import { getPersonInfo } from './db/ui'
import fs from 'fs'

const app = express()
app.set("views", path.join(__dirname, "../views"))
app.set('viewengine', 'ejs')

// const FileStore = require('session-file-store')(session);
app.use(session({
	genid: (req) => {
		return uuid()
	},
	// store: new FileStore(),
	secret: env.sessionSecret,
	resave: false,
	saveUninitialized: true
}))

app.use(passport.initialize())
app.use(passport.session())

app.get(`/auth/${env.provider}/`, passport.authenticate(env.provider, { scope: env.scope }))
app.get(`/auth/${env.provider}/callback`,
	passport.authenticate(env.provider, {
		successRedirect: '/',
		failureRedirect: env.loginRoute
	}))
app.get('/auth/logout', (req, res) => {
	req.logout()
	res.redirect('/')
})

//@ts-ignore
const gmailAuthPath = env.web.redirect_uris[0]!.split('/').at(-1) // 'abn423sd'
app.get(`/AUTHGMAIL${gmailAuthPath}`, (req, res) => {
	res.redirect(authUrl)
})

app.get(`/${gmailAuthPath}`, async (req, res) => {
	await saveToken(req.query.code)
	const succes = await setGmailSuccess()
	res.send(succes ? 'success' : 'failure')
})

const dataBase = new DataBase("database.json");

(async () => {
	while (true) {
		await dataBase.pullMails()
		await new Promise((resolve, reject) => setTimeout(resolve, 2 * 60 * 1000))
	}
})()

app.get('/', async (req, res) => {
	if (!req.user)
		return res.redirect('/setup')
	const user = req.user as UserProfile
	const userData = getPersonInfo(dataBase._db.reports, user.login)
	if (!userData || userData.reports.length == 0)
		return res.redirect('/setup')
	res.render('index.ejs', userData)
})

app.get('/setup', async (req, res) => {
	const data = {
		// forwardVerifications: req.user ? dataBase.getForwardVerifications() : [],
		forwardVerifications: dataBase.getForwardVerifications(),
		loginRoute: env.loginRoute,
	}
	res.render('setup.ejs', data)
})

app.get('/mailfilterfile', (req, res) => {
	const file = '/app/public/logtimeReportForwarding.xml'
	res.setHeader('Content-disposition', 'attachment; filename=' + path.basename(file))
	res.setHeader('Content-type', 'XML')
	let filestream = fs.createReadStream(file)
	filestream.pipe(res)
	// You would thing that this is easy right? Well nooo Safari gives a "no rss feed installed" error
	// res.attachment('/app/logtimeReportForwarding.xml')
})

const port = process.env['PORT'] || 8080
app.listen(port, () => console.log('app ready on port', port))
