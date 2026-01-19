import { Router, Request, Response } from 'express'
import { resolveBuildId } from '../utils/buildId'
import { getBootId } from '../utils/bootId'

function createMetaRouter(): Router {
  const router = Router()

  router.get('/', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store')
    res.status(200).json({ buildId: resolveBuildId(), bootId: getBootId() })
  })

  return router
}

module.exports = createMetaRouter
