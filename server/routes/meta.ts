import { Router, Request, Response } from 'express'
import { resolveBuildId } from '../utils/buildId'

function createMetaRouter(): Router {
  const router = Router()

  router.get('/', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store')
    res.status(200).json({ buildId: resolveBuildId() })
  })

  return router
}

module.exports = createMetaRouter
