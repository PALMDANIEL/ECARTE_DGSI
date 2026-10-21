import 'dotenv/config';
import express, {Request, Response, NextFunction} from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const app = express();
app.use(cors({origin: '*'}));
app.use(express.json());

const JWT_SECRET = 'default_secret';

const users = [{id: '1', email: 'admin@demo.com', password: bcrypt.hashSync('password123', 10), firstName: 'Admin', lastName: 'Demo', companyId: '1', role: 'ADMIN'}];

interface AuthRequest extends Request {
  user?: any;
}

const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({message: 'Unauthorized'});
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({message: 'Invalid token'});
  }
};

app.post('/api/auth/login', (req, res) => {
  const user = users.find(u => u.email === req.body.email);
  if (!user || !bcrypt.compareSync(req.body.password, user.password)) {
    return res.status(401).json({message: 'Invalid credentials'});
  }
  const token = jwt.sign({id: user.id, email: user.email, companyId: user.companyId, role: user.role}, JWT_SECRET, {expiresIn: '15m'});
  res.json({user: {id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, companyId: user.companyId, role: user.role}, accessToken: token, refreshToken: token});
});

let cards: any[] = [];
let idCounter = 1;

app.post('/api/cards', authenticate, (req: AuthRequest, res: Response) => {
  const {fullName, jobTitle, ministry, direction, service, email, phoneMobile, phoneWork, whatsapp, website, linkedin, facebook, instagram, tiktok, address, companyId} = req.body;
  const card = {
    id: String(idCounter++),
    slug: fullName.toLowerCase().replace(/\s+/g, '-'),
    fullName,
    jobTitle: jobTitle || '',
    ministry: ministry || '',
    direction: direction || '',
    service: service || '',
    email: email || '',
    phoneMobile: phoneMobile || '',
    phoneWork: phoneWork || '',
    whatsapp: whatsapp || '',
    website: website || '',
    linkedin: linkedin || '',
    facebook: facebook || '',
    instagram: instagram || '',
    tiktok: tiktok || '',
    address: address || '',
    companyId: companyId || req.user!.companyId,
    userId: req.user!.id,
    isActive: true,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  cards.push(card);
  res.status(201).json(card);
});

app.get('/api/cards', authenticate, (req: AuthRequest, res: Response) => {
  const userCards = cards.filter(c => c.companyId === req.user!.companyId && !c.isArchived);
  res.json(userCards);
});

app.get('/api/cards/:id', authenticate, (req: AuthRequest, res: Response) => {
  const card = cards.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({message: 'Not found'});
  res.json(card);
});

app.put('/api/cards/:id', authenticate, (req: AuthRequest, res: Response) => {
  const idx = cards.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({message: 'Not found'});
  cards[idx] = {...cards[idx], ...req.body, updatedAt: new Date()};
  res.json(cards[idx]);
});

app.delete('/api/cards/:id', authenticate, (req: AuthRequest, res: Response) => {
  const idx = cards.findIndex(c => c.id === req.params.id);
  if (idx !== -1) {
    cards[idx].isArchived = true;
    cards[idx].isActive = false;
  }
  res.status(204).send();
});

app.get('/api/dashboard/stats', authenticate, (req: AuthRequest, res: Response) => {
  res.json({users: 1, companies: 1, cards: cards.filter(c => !c.isArchived).length, scans: 0, charts: {scans: [0,0,0,0,0,0,0], topCards: []}});
});

const PORT = 3005;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});
