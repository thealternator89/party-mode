import { Request, Response } from 'express';
import { URL } from 'url';
import { youTubeClient } from '../api-client/YouTubeClient';
import { youTubeVideoDetailsCache } from '../api-client/YouTubeVideoDetailsCache';
import { userAuthHandler } from '../auth/UserAuthHandler';
import { Constants as CONSTANTS } from '../constants';
import { PrivacyMode } from '../enums';
import { IQueueItem } from '../models/QueueItem';
import { IYouTubeVideoDetails } from '../models/YouTubeVideoDetails';
import { PlayerQueue } from '../queue/PlayerQueue';
import { playerQueuesManager } from '../queue/PlayerQueuesManager';
import { IEndpoint } from './Endpoint';

class ApiEndpointHandler implements IEndpoint {

    public registerApiEndpoints(app: any) {
        app.get('/api/client/poll', async (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                response.status(500).send('Queue not found');
                return;
            }

            const playerStatus = queue.getPlayerState();

            response.json({
                duration: playerStatus.duration,
                playerState: playerStatus.playerState,
                position: playerStatus.position,
                video: await youTubeVideoDetailsCache.getFromCacheOrApi(playerStatus.videoId),
            });
        });

        app.get('/api/auth', (request: Request, response: Response) => {
            const providedAuthString = request.query.auth;
            const providedUserName = request.query.name;

            if (!providedAuthString || !providedUserName) {
                response.status(400).send('Invalid request');
                return;
            }

            try {
                const token = userAuthHandler.authenticateNewUser(providedAuthString, providedUserName);
                response.send(token);
            } catch (error) {
                response.status(403).send(`Invalid auth string`);
                return;
            }
        });

        app.get('/api/enqueue', async (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                return;
            }

            let videoId = request.query.videoId;
            const url = request.query.url;
            const addNext = request.query.next === 'true';
            const noInfluence = request.query.noinfluence === 'true';

            // Replace the videoId with the one from the URL only if it is undefined.
            // If both videoId and url params exist, videoId wins.
            if (!videoId && url) {
                try {
                    const videoUrl = new URL(url);
                    videoId = videoUrl.searchParams.get('v');
                } catch (error) {
                    response.status(400).send(`Invalid video URL: ${url}: ${error.message}`);
                    return;
                }
            }

            if (!videoId) {
                response.status(400).send('Invalid request');
                return;
            }

            const queueItem: IQueueItem = {
                autoQueueInfluence: noInfluence ?
                    CONSTANTS.AUTO_QUEUE_INFLUENCE.NO_INFLUENCE : CONSTANTS.AUTO_QUEUE_INFLUENCE.USER_ADDED,
                user: this.getAuthToken(request),
                videoId: videoId,
            };

            let queuePosition = 1;
            if (addNext) {
                queue.addToFront(queueItem);
            } else {
                queue.enqueue(queueItem);
                queuePosition = queue.length();
            }

            const details = await youTubeVideoDetailsCache.getFromCacheOrApi(videoId);

            response.type('json').send(JSON.stringify({...details, queuePosition: queuePosition}));
        });

        // FIXME: There's a couple of big issues here:
        //  * This will fail if there are two versions of the same video in the queue added by different users
        //  * This has a race condition; the array can be changed between finding the item to remove and removing it.
        // This functionality should probably be moved into the queue anyway.
        app.get('/api/dequeue', (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                return;
            }

            const videoToDequeue = request.query.videoId;
            const token = request.query.token;
            const videoPosition = queue.findPosition(videoToDequeue);

            if (videoPosition === -1) {
                response.status(400).send(`Item not in queue: ${videoToDequeue}`);
                return;
            }

            try {
                queue.dequeue(videoPosition, token);
            } catch (error) {
                response.status(400).send(`Dequeue failed: ${error.message}`);
            }
            response.send(`Dequeued: ${videoToDequeue}`);
        });

        app.get('/api/queue_state', async (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                return;
            }

            const queueItems: IYouTubeVideoDetails[] = [];
            for (const queueItem of queue.getAllQueuedItems()) {
                queueItems.push(await youTubeVideoDetailsCache.getFromCacheOrApi(queueItem.videoId));
            }

            if (queueItems.length === 0) {
                const upNext = queue.getNextAutoPlayItem();
                queueItems.push(await youTubeVideoDetailsCache.getFromCacheOrApi(upNext));
            }

            response.type('json').send(JSON.stringify({
                autoPlayEnabled: queue.getShouldAutoPlay(),
                queue: queueItems,
            }));
        });

        app.get('/api/autoplay_blacklist', (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                return;
            }

            const videoId: string|undefined = request.query.videoId;
            let action: string|undefined = request.query.action;

            if (!videoId || !action) {
                response.status(400).send(`'videoId' and 'action' query parameters are required`);
                return;
            }

            action = action.toLowerCase();

            if (!['add', 'remove'].includes(action)) {
                response.status(400).send(`Invalid value for 'action'. Valid options are: add, remove`);
                return;
            }

            if (action === 'add') {
                queue.preventAutoPlay(videoId);
            } else if (action === 'remove') {
                queue.allowAutoPlay(videoId);
            }

            response.send('Completed Successfully');
        });

        app.get('/api/play_history', async (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                return;
            }

            const fullHistory = request.query.fullHistory === 'true';

            const historyItems: IYouTubeVideoDetails[] = [];
            let historyIds: string[] = [...queue.getAllPlayedVideoIds()];

            if (!fullHistory) {
                historyIds = historyIds.slice(0, 20);
            }

            for (const videoId of historyIds) {
                historyItems.push(await youTubeVideoDetailsCache.getFromCacheOrApi(videoId));
            }

            response.type('json').send(JSON.stringify(historyItems));
        });

        // TODO: This should be split up and simplified.
        // Player commands just get thrown onto the MessageBus, pretty much avoiding the PlayerQueue
        // AutoPlay and Privacy commands are basically just PlayerQueue setting modifications
        // So maybe change to /api/send_command and /api/settings, and make it a GET to retrieve, or POST to set?
        app.get('/api/set_command', (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                return;
            }

            let playerCommand: string|undefined = request.query.player;
            let autoPlayCommand: string|undefined = request.query.autoplay;
            let privacyCommand: string|undefined = request.query.privacy;

            if (!playerCommand && !autoPlayCommand && !privacyCommand) {
                response.status(400).send('At least one command required');
                return;
            }

            if (playerCommand) {
                playerCommand = playerCommand.toUpperCase();
                switch (playerCommand) {
                    case 'PLAY': // Fall Through
                    case 'PAUSE': // Fall Through
                    case 'NEXTTRACK': // Fall Through
                    case 'REPLAYTRACK': queue.setPlayerCommand(playerCommand as any);
                }
            }

            if (autoPlayCommand) {
                autoPlayCommand = autoPlayCommand.toUpperCase();

                switch (autoPlayCommand) {
                    case 'ENABLE':
                        queue.setShouldAutoPlay(true);
                        break;
                    case 'DISABLE':
                        queue.setShouldAutoPlay(false);
                        break;
                }
            }

            if (privacyCommand) {
                privacyCommand = privacyCommand.toUpperCase();

                switch (privacyCommand) {
                    case 'FULLNAME':
                        queue.setPrivacyMode(PrivacyMode.FULL_NAMES);
                        break;
                    case 'USERAUTO':
                        queue.setPrivacyMode(PrivacyMode.USER_OR_AUTO);
                        break;
                    case 'HIDDEN':
                        queue.setPrivacyMode(PrivacyMode.HIDDEN);
                        break;
                }
            }

            response.type('json').send({
                autoPlayCommand: autoPlayCommand,
                playerCommand: playerCommand,
                privacyCommand: privacyCommand,
            });
        });

        app.get('/api/search', async (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const searchQuery = request.query.q;
            const pageToken = request.query.page;

            if (!searchQuery) {
                response.status(400).send('No search query provided');
                return;
            }

            const results = await youTubeClient.search(searchQuery, pageToken);

            response.type('json').send(JSON.stringify(results));
        });

        app.get('/api/autocomplete', async (request: Request, response: Response) => {
            const searchQuery = request.query.q;

            const results = await youTubeClient.getSearchAutoComplete(searchQuery);
            response.type('json').send(JSON.stringify(results));
        });

        app.get('/api/autoqueue_state', async (request: Request, response: Response) => {
            if (!this.validateToken(request, response)) {
                return;
            }

            const queue = this.getQueueByAuthToken(request, response);
            if (!queue) {
                return;
            }

            const autoQueueWithYtDetails: any[] = [];
            for (const queueItem of queue.getAutoPlayState()) {
                const videoDetails = await youTubeVideoDetailsCache.getFromCacheOrApi(queueItem.videoId);
                autoQueueWithYtDetails.push({
                    numberOfSongsUntilAvailableToPlay: queueItem.numberOfSongsUntilAvailableToPlay,
                    score: queueItem.score,
                    video: videoDetails,
                });
            }

            response.json(autoQueueWithYtDetails);
        });

        app.get(`/api/internal/queue_states`, async (request: Request, response: Response) => {
            const queueKeys = playerQueuesManager.getAllQueueKeys();

            const queues = queueKeys.map((key) => {
                const queue = playerQueuesManager.getPlayerQueueForKey(key);
                return {
                    key: key,
                    lastTouched: queue.getTimeLastTouched(),
                    length: queue.length(),
                };
            });
            response.type('json').send(JSON.stringify(queues));
        });

        app.get('/api/internal/clean_queues', async (request: Request, response: Response) => {
            const beforeCount = playerQueuesManager.numQueues();
            playerQueuesManager.cleanUpOldPlayerQueues();
            const afterCount = playerQueuesManager.numQueues();
            response.type('json').send(JSON.stringify({
                    deleted: (beforeCount - afterCount),
            }));
        });
    }

    private validateToken(request: Request, response: Response) {
        const token = this.getAuthToken(request);
        if (!userAuthHandler.validateToken(token)) {
            response.status(401).send('Unauthorized');
            return false;
        }
        return true;
    }

    private getQueueByAuthToken(request: Request, response: Response): PlayerQueue|undefined {
        const token = this.getAuthToken(request);
        const queue = userAuthHandler.getQueueForToken(token);

        if (!queue) {
            response.status(400).send('Invalid request');
            return undefined;
        }

        return queue;
    }

    private getAuthToken(request: Request): string|undefined {
        return request.query.token;
    }
}

export const apiEndpointHandler = new ApiEndpointHandler();