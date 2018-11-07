import * as path from 'path';
import { Response, Request } from "express";
import { userAuthHandler } from "../auth/UserAuthHandler";

export class WebClientEndpointHandler {
    public registerApiEndpoints(app: any) {
        app.get('/', (request: Request, response: Response) => {
            response.redirect('/client');
        });

        app.get('/client', (request: Request, response: Response) => {
            if(!this.validateCookie(request, response)) {
                return;
            }

            response.redirect('/client/home');
        });

        app.get('/client/login', (request: Request, response: Response) => {
            response.sendFile(path.join(__dirname, '..' , 'views/html', 'login.html'));
        });

        app.post('/client/login', (request: Request, response: Response) => {
            const psk = request.body['inputPreSharedKey'];
            const name = request.body['inputName'];
            
            if(!name || !psk) {
                response.redirect('/client/login');
                return;
            }

            let token;

            try {
                token = userAuthHandler.authenticateNewUser(psk, name);
            } catch (error) {
                response.redirect('/login');
                return;
            }

            response.cookie('token', token);

            response.redirect('/client');
        });

            if(!this.validateCookie(request, response)) {
                return;
            } 
            response.sendFile(path.join(__dirname, '..' , 'views/html', 'home.html'));
        app.get('/client/home', (request: Request, response: Response) => {
        });

            if(!this.validateCookie(request, response)) {
                return;
            } 
            response.sendFile(path.join(__dirname, '..' , 'views/html', 'search.vue.html'));
        app.get('/client/search', (request: Request, response: Response) => {
        });

            if(!this.validateCookie(request, response)) {
                return;
            } 
            response.sendFile(path.join(__dirname, '..' , 'views/html', 'playing.vue.html'));
        app.get('/client/playing', (request: Request, response: Response) => {
        });
    }

    private validateCookie(request, response) {
        if (request.cookies['token'] && userAuthHandler.validateToken(request.cookies['token'])) {
            return true;
        } else {
            response.redirect('/client/login');
            return false;
        }
    }
}

export const webClientEndpointHandler = new WebClientEndpointHandler();