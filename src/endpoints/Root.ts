import { Request, Response, Router } from 'express';

import * as path from 'path';

import { apiRouter } from './Api';

const router = Router();

const loadClient = (_request: Request, response: Response) => {
    response.sendFile(path.join(__dirname, '..', '..' , 'static', 'mobile', 'index.html'));
}

router.use('/api', apiRouter);

// Handle all endpoints used by the angular app, to ensure we don't weirdly 404 a valid url
router.get('/', loadClient);
router.get('/connect', loadClient);
router.get('/featured', loadClient);
router.get('/history', loadClient);
router.get('/home', loadClient);
router.get('/queue', loadClient);
router.get('/search', loadClient);

router.get('/cast', (request: Request, response: Response) => {
    response.sendFile(path.join(__dirname, '..' , 'views/html/client', 'chromecast.sender.html'));
});

router.get('/player', (request: Request, response: Response) => {
    response.sendFile(path.join(__dirname, '..' , 'views/html/player', 'player.html'));
});

router.get('/player/cast', (request: Request, response: Response) => {
    response.sendFile(path.join(__dirname, '..' , 'views/html/player', 'chromecast.player.html'));
});

export const rootRouter = router;